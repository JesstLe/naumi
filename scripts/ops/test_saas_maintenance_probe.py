"""Failure cases for actual HTTP maintenance evidence; no server mutations."""
import copy
import unittest

from release47_host import Hold
from saas_maintenance_probe import BODY, MARKER, PATHS, probe_maintenance, validate_ingress


def inventory():
    servers, endpoints = [], []
    for ordinal, listen, origin in [(0,['80'],'http://47.105.59.142'),
                                     (1,['443','ssl'],'https://47.105.59.142')]:
        server = {'path':'/etc/nginx/site','serverOrdinal':ordinal,'listen':[listen],
                  'serverNames':['47.105.59.142'],'serverSha256':'a'*64}
        servers.append(server)
        endpoints.append({key:server[key] for key in ['path','serverOrdinal']})
        endpoints[-1].update(listen=listen,origin=origin,connectAddress='47.105.59.142')
    return {'target':'47.105.59.142','servers':servers,'httpEndpoints':endpoints}


class MaintenanceProbe(unittest.TestCase):
    def reader(self, endpoint, path, method):
        return 503, {'Cache-Control':'no-store','Retry-After':'60','X-Naumi-Recovery':MARKER}, BODY if method=='GET' else b''

    def test_each_audited_origin_and_every_safe_path_get_and_head(self):
        result = probe_maintenance(inventory(),reader=self.reader)
        self.assertTrue(result['passed'])
        self.assertEqual(len(result['rows']),2 * len(PATHS) * 2)
        self.assertFalse(result['tlsVerificationBypassed'])
        self.assertFalse(result['redirectsFollowed'])
        self.assertEqual(result['dispatchMutations'],0)

    def test_missing_listener_hostname_or_public_ip_cannot_be_omitted(self):
        for change in ['listener','hostname','public-ip','duplicate','unreviewed']:
            value = copy.deepcopy(inventory())
            if change == 'listener': value['httpEndpoints'].pop()
            if change == 'hostname': value['servers'][0]['serverNames'].append('example.test')
            if change == 'public-ip':
                for endpoint in value['httpEndpoints']: endpoint['connectAddress']='127.0.0.1'
            if change == 'duplicate': value['httpEndpoints'].append(copy.deepcopy(value['httpEndpoints'][0]))
            if change == 'unreviewed': value['httpEndpoints'][0]['serverOrdinal']=2
            with self.subTest(change=change), self.assertRaises(Hold): validate_ingress(value)

    def test_tls_and_connection_address_cannot_be_silently_changed(self):
        for change in ['protocol','port','address','path','wildcard','credential']:
            value = copy.deepcopy(inventory())
            if change == 'protocol': value['httpEndpoints'][1]['origin']='http://47.105.59.142:443'
            if change == 'port': value['httpEndpoints'][1]['origin']='https://47.105.59.142:444'
            if change == 'address': value['httpEndpoints'][1]['connectAddress']='192.0.2.1'
            if change == 'path': value['httpEndpoints'][0]['origin']+='/?redirect=yes'
            if change == 'wildcard': value['servers'][0]['serverNames']=['*.example.test']
            if change == 'credential': value['httpEndpoints'][0]['origin']='http://user:secret@47.105.59.142'
            with self.subTest(change=change), self.assertRaises(Hold): validate_ingress(value)

    def test_ipv6_or_specific_ip_listener_cannot_claim_another_socket(self):
        for token,address,passed in [('[::]:443','47.105.59.142',False),
                                      ('[::]:443','::1',True),
                                      ('127.0.0.1:443','47.105.59.142',False),
                                      ('47.105.59.142:443','127.0.0.1',False),
                                      ('127.0.0.1:443','127.0.0.1',True),
                                      ('0.0.0.0:443','47.105.59.142',True)]:
            value=inventory()
            listen=[token,'ssl']
            value['servers'][1]['listen']=[listen]
            value['httpEndpoints'][1].update(listen=listen,connectAddress=address)
            with self.subTest(token=token,address=address):
                if passed:validate_ingress(value)
                else:
                    with self.assertRaisesRegex(Hold,'PHYSICAL_LISTENER'):validate_ingress(value)

    def test_reload_or_503_alone_is_insufficient_and_every_endpoint_is_observed(self):
        for change in ['status','cache','retry','marker','body','tls']:
            seen=[]
            def reader(endpoint,path,method):
                seen.append(endpoint['origin'])
                status,headers,body=self.reader(endpoint,path,method)
                if change=='status':status=302
                if change=='cache':headers['Cache-Control']='public'
                if change=='retry':headers.pop('Retry-After')
                if change=='marker':headers.pop('X-Naumi-Recovery')
                if change=='body':body=b'old upstream'
                if change=='tls':raise OSError('synthetic TLS certificate mismatch')
                return status,headers,body
            with self.subTest(change=change):
                result=probe_maintenance(inventory(),reader=reader)
                self.assertFalse(result['passed'])
                self.assertEqual(len(seen),2)
                self.assertEqual(set(seen),{'http://47.105.59.142','https://47.105.59.142'})


if __name__=='__main__':unittest.main()
