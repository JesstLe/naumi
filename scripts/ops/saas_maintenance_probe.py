"""Read-only HTTP evidence for the reviewed SaaS maintenance ingress.

Nginx syntax/reload is deliberately not accepted as HTTP sealing evidence.
No redirects, proxy environment, authentication, dispatch or TLS bypass.
"""
import hashlib
import http.client
import ipaddress
import re
import ssl
import urllib.parse

from release47_host import require

MARKER = 'saas-controlled-maintenance'
BODY = b'Service temporarily unavailable.'
PATHS = ('/', '/admin/', '/enterprise', '/canvas', '/desktop', '/studio3d',
         '/api/version', '/api/admin/tenants?page=1&size=1', '/api/enterprise/records',
         '/api/imagegen', '/api/generate-image', '/api/video/worker/drain-status',
         '/api/internal/release/status', '/legacy-workbench/admin',
         '/_next/static/__saas_maintenance_probe__.js',
         '/video-reference-media/__saas_maintenance_probe__.webp',
         '/api/saas/creations/foreign/assets/__saas_maintenance_probe__')


def validate_ingress(ingress):
    servers, endpoints = ingress.get('servers'), ingress.get('httpEndpoints')
    require(isinstance(servers, list) and servers and isinstance(endpoints, list)
            and 0 < len(endpoints) <= 16, 'MAINTENANCE_HTTP_INVENTORY_REQUIRED')
    inventory = {(s['path'], s['serverOrdinal']): s for s in servers}
    require(len(inventory) == len(servers), 'MAINTENANCE_DUPLICATE_SERVER')
    expected, observed = set(), set()
    for key, server in inventory.items():
        names = server['serverNames'] or [ingress['target']]
        # Wildcard/regex virtual hosts need an explicit expanded audit first.
        require(all(re.fullmatch(r'[A-Za-z0-9_.:-]+', h) for h in names),
                'EXPAND_PUBLIC_SERVER_NAMES_BEFORE_MAINTENANCE')
        for listen in server['listen']:
            for hostname in names:
                expected.add((key, tuple(listen), ingress['target'] if hostname == '_' else hostname))
    for endpoint in endpoints:
        require(isinstance(endpoint, dict) and set(endpoint) ==
                {'path', 'serverOrdinal', 'listen', 'origin', 'connectAddress'},
                'MAINTENANCE_ENDPOINT_FIELDS_REQUIRED')
        key = endpoint['path'], endpoint['serverOrdinal']
        require(key in inventory and endpoint['listen'] in inventory[key]['listen'],
                'MAINTENANCE_ENDPOINT_NOT_AUDITED')
        url = urllib.parse.urlsplit(endpoint['origin'])
        require(url.scheme in ('http', 'https') and url.hostname and not url.username
                and not url.password and not url.query and not url.fragment and url.path in ('', '/'),
                'MAINTENANCE_ORIGIN_INVALID')
        listen = endpoint['listen']
        match = re.search(r'(?:^|:)([0-9]+)$', listen[0])
        require(match and int(match[1]) == (url.port or (443 if url.scheme == 'https' else 80))
                and ('ssl' in listen) == (url.scheme == 'https'), 'MAINTENANCE_LISTENER_PROTOCOL_CHANGED')
        try:
            address = ipaddress.ip_address(endpoint['connectAddress'])
        except ValueError:
            require(False, 'MAINTENANCE_CONNECTION_IP_REQUIRED')
        require(str(address) == ingress['target'] or address.is_loopback,
                'MAINTENANCE_CONNECTION_OUTSIDE_TARGET')
        token = listen[0]
        if re.fullmatch(r'[0-9]+', token) or token.startswith('*:'):
            bound = ipaddress.ip_address('0.0.0.0')
        else:
            literal = token.rsplit(':',1)[0].strip('[]')
            try:
                bound = ipaddress.ip_address(literal)
            except ValueError:
                require(False, 'MAINTENANCE_LITERAL_LISTENER_REQUIRED')
        require(bound.version == address.version and (bound.is_unspecified or bound == address),
                'MAINTENANCE_PHYSICAL_LISTENER_CHANGED')
        observed.add((key, tuple(listen), url.hostname))
    require(observed == expected and len(observed) == len(endpoints),
            'MAINTENANCE_PUBLIC_LISTENER_COVERAGE_INCOMPLETE')
    require(any(e['connectAddress'] == ingress['target'] for e in endpoints),
            'MAINTENANCE_PUBLIC_IP_PROBE_REQUIRED')
    return endpoints


def read_endpoint(endpoint, path, method, *, context=None, port_override=None):
    url = urllib.parse.urlsplit(endpoint['origin'])
    connection_type = http.client.HTTPSConnection if url.scheme == 'https' else http.client.HTTPConnection
    kwargs = {'timeout': 3}
    if url.scheme == 'https':
        kwargs['context'] = context or ssl.create_default_context()
    connection = connection_type(url.hostname, port=url.port, **kwargs)
    # Keep HTTP Host and TLS SNI/certificate verification bound to the audited
    # origin, while selecting the exact physical listener independently.
    def connect(address, timeout=3, source_address=None):
        import socket
        return socket.create_connection((endpoint['connectAddress'], port_override or address[1]),
                                        timeout, source_address)
    connection._create_connection = connect
    try:
        connection.request(method, path, headers={'Cache-Control': 'no-cache', 'RSC': '1',
                                                  'Range': 'bytes=0-99', 'Connection': 'close'})
        response = connection.getresponse()
        body = response.read(4097)
        return response.status, dict(response.getheaders()), body
    finally:
        connection.close()


def probe_maintenance(ingress, *, reader=read_endpoint):
    endpoints = validate_ingress(ingress)
    rows = []
    for index, endpoint in enumerate(endpoints):
        for path in PATHS:
            failed = False
            for method in ('GET', 'HEAD'):
                row = {'endpoint': index, 'path': path, 'method': method, 'passed': False}
                try:
                    status, headers, body = reader(endpoint, path, method)
                    headers = {key.lower(): value for key, value in headers.items()}
                    row.update(http=status, noStore=headers.get('cache-control') == 'no-store',
                               retryAfter=headers.get('retry-after') == '60',
                               marker=headers.get('x-naumi-recovery') == MARKER,
                               bodySha256=hashlib.sha256(body).hexdigest())
                    row['passed'] = (status == 503 and row['noStore'] and row['retryAfter'] and row['marker']
                                     and body == (BODY if method == 'GET' else b''))
                except Exception as error:
                    row['error'] = type(error).__name__
                rows.append(row)
                if not row['passed']:
                    failed = True
                    break
            if failed:
                break
    return {'kind': 'saas-maintenance-http-proof', 'passed': len(rows) == len(endpoints) * len(PATHS) * 2
            and all(row['passed'] for row in rows), 'endpointCount': len(endpoints), 'rows': rows,
            'redirectsFollowed': False, 'tlsVerificationBypassed': False, 'dispatchMutations': 0,
            'oldBusinessProgramResumed': False}
