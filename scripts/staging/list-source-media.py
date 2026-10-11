#!/usr/bin/env python3
"""Read-only S3 ListObjectsV2 inventory, including opaque source ETags."""
import configparser
import datetime
import hashlib
import hmac
import json
import pathlib
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

D = pathlib.Path('/opt/naumi-staging/evidence/data-sync-20261012')
config = configparser.ConfigParser(interpolation=None)
config.read(D / 'media-import.conf')
c = config['source']
bucket = (D / 'media-import.bucket').read_text().strip()
objects = []
token = ''
for page in range(100):
    now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    day = now[:8]
    u = urllib.parse.urlparse(c['endpoint'])
    path = u.path.rstrip('/') + '/' + urllib.parse.quote(bucket, safe='-_.~')
    params = {'list-type': '2', 'max-keys': '1000'}
    if token:
        params['continuation-token'] = token
    query = '&'.join(urllib.parse.quote(k, safe='-_.~') + '=' + urllib.parse.quote(v, safe='-_.~') for k, v in sorted(params.items()))
    payload = hashlib.sha256(b'').hexdigest()
    headers = f'host:{u.netloc}\nx-amz-content-sha256:{payload}\nx-amz-date:{now}\n'
    names = 'host;x-amz-content-sha256;x-amz-date'
    canonical = '\n'.join(('GET', path, query, headers, names, payload))
    scope = day + '/' + c['region'] + '/s3/aws4_request'
    string = 'AWS4-HMAC-SHA256\n' + now + '\n' + scope + '\n' + hashlib.sha256(canonical.encode()).hexdigest()
    key = ('AWS4' + c['secret_access_key']).encode()
    for v in (day, c['region'], 's3', 'aws4_request'):
        key = hmac.new(key, v.encode(), hashlib.sha256).digest()
    signature = hmac.new(key, string.encode(), hashlib.sha256).hexdigest()
    req = urllib.request.Request(u.scheme + '://' + u.netloc + path + '?' + query, headers={
        'x-amz-date': now, 'x-amz-content-sha256': payload,
        'Authorization': 'AWS4-HMAC-SHA256 Credential=' + c['access_key_id'] + '/' + scope + ', SignedHeaders=' + names + ', Signature=' + signature,
    })
    with urllib.request.urlopen(req, timeout=30) as response:
        tree = ET.fromstring(response.read())
    ns = {'s': 'http://s3.amazonaws.com/doc/2006-03-01/'}
    for item in tree.findall('s:Contents', ns):
        key = item.findtext('s:Key', namespaces=ns)
        assert key and '\n' not in key and '\r' not in key
        target = (pathlib.Path('/opt/naumi-staging/data/media') / key).resolve()
        assert pathlib.Path('/opt/naumi-staging/data/media') in target.parents
        etag = item.findtext('s:ETag', namespaces=ns).strip('"')
        objects.append({'Path': key, 'Size': int(item.findtext('s:Size', namespaces=ns)),
                        'ETag': etag, 'Hashes': {'md5': etag} if len(etag) == 32 and all(x in '0123456789abcdef' for x in etag) else {},
                        'ModTime': item.findtext('s:LastModified', namespaces=ns)})
    if tree.findtext('s:IsTruncated', namespaces=ns) != 'true':
        break
    token = tree.findtext('s:NextContinuationToken', namespaces=ns)
    assert token
else:
    raise RuntimeError('LIST_PAGE_LIMIT')
(D / 'source-media-manifest.json').write_text(json.dumps(objects))
root = pathlib.Path('/opt/naumi-staging/data/media')
missing = [o for o in objects if not (root / o['Path']).is_file()]
(D / 'missing-media-keys.txt').write_text('\n'.join(o['Path'] for o in missing) + '\n')
print('SOURCE_OBJECTS=%d BYTES=%d MISSING_OBJECTS=%d MISSING_BYTES=%d' %
      (len(objects), sum(o['Size'] for o in objects), len(missing), sum(o['Size'] for o in missing)))
