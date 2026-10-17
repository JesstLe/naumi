"""Narrow recovery for a delivered child rejected solely by receipt byte limit.

This is not generation or postprocessing. The exact original PNG is decoded
and hashed by the caller; all child settlement and ownership must already be
proven. Plans that need another transformation are intentionally excluded.
"""
import copy
from release47_host import require


def recovered_snapshot(parent, child, pixels, charge):
    plan, snapshot = parent['payload']['plan'], parent['snapshot']
    request = plan['request']
    require(parent['email'] == child['email'] and child['kind'] == 'generate' and
            child['snapshot'].get('status') == 'done' and child['billing_settled'] is True,
            'SETTLED_OWNED_CHILD_REQUIRED')
    require(snapshot.get('status') == 'error' and snapshot.get('result', {}).get('error', {}).get('message') ==
            '对象超过大小限制', 'EXACT_RECEIPT_LIMIT_FAILURE_REQUIRED')
    require(len(plan['steps']) == 1 and plan['steps'][0]['operation'] in ['generate', 'edit'] and
            request.get('output') == {'format': 'png'} and not request.get('chroma') and
            not any(i['role'] == 'mask' for i in request['inputs']) and
            plan['intent'].get('background') is None, 'UNPROCESSED_NATIVE_PNG_PLAN_REQUIRED')
    images = child['snapshot'].get('images', [])
    require(len(images) == 1 and len(snapshot['children']) == 1 and
            next(iter(snapshot['children'].values())) ==
            {'state': 'done', 'jobId': child['id'], 'ids': [images[0]['id']]}, 'EXACT_COMPLETED_CHILD_REQUIRED')
    require(pixels['format'] == 'png' and pixels['width'] == images[0]['width'] and
            pixels['height'] == images[0]['height'] and pixels['visiblePixels'] > 0 and
            pixels['totalPixels'] <= 40_000_000 and 12 * 1024**2 < pixels['bytes'] <= 64 * 1024**2,
            'VERIFIED_LARGE_PNG_REQUIRED')
    require(type(charge) is int and charge >= 0, 'ACTUAL_SETTLEMENT_REQUIRED')
    artifact = {'artworkId': images[0]['id'], 'url': images[0]['url'], 'mime': 'image/png',
                **{k: pixels[k] for k in ['width', 'height', 'transparentPixels',
                                         'fullyTransparentPixels', 'visiblePixels', 'totalPixels']}}
    result = copy.deepcopy(snapshot)
    result['status'] = 'done'
    result['result'].update(status='succeeded', stage='done', artifacts=[artifact], chargedCredits=charge)
    result['result'].pop('error', None)
    return result
