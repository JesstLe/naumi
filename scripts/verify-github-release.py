#!/usr/bin/env python3
"""Concentrated checks for image provenance, flavor routing, and safe import refusal."""
import argparse
import copy
import importlib.util
import json
import io
import hashlib
import pathlib
import tempfile
import tarfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('release_manifest', pathlib.Path(__file__).with_name('github-release-manifest.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
SHA = 'a' * 40


def record():
    return {'schemaVersion': 1, 'sourceCommit': SHA, 'buildVersion': 123,
            'platform': 'linux/amd64', 'mediaVariants': True,
            'provenance': {'repository': 'JesstLe/naumi', 'workflowCommit': 'b' * 40, 'runId': '1234', 'attempt': '1'},
            'images': {flavor: {'reference': release.IMAGE + '@sha256:' + str(n) * 64,
                               'digest': 'sha256:' + str(n) * 64,
                               'tag': release.IMAGE + ':' + SHA + ('' if flavor == 'ui' else '-' + flavor),
                               'imageId': 'sha256:' + str(n + 3) * 64}
                       for n, flavor in enumerate(release.ORDER, 1)}}


class ReleaseChecks(unittest.TestCase):
    def test_complete_fixed_candidate(self):
        release.validate(record(), SHA, release.ORDER)

    def test_tampered_identity_and_references(self):
        changes = [('sourceCommit', 'b' * 40), ('platform', 'linux/arm64'), ('mediaVariants', False), ('schemaVersion', True), ('buildVersion', True)]
        for key, value in changes:
            candidate = record(); candidate[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                release.validate(candidate, SHA, release.ORDER)
        for key, value in [('reference', 'ghcr.io/another/repo@sha256:' + '1' * 64), ('tag', release.IMAGE + ':latest'), ('imageId', 'sha256:bad')]:
            candidate = record(); candidate['images']['ui'][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                release.validate(candidate, SHA, release.ORDER)

    def test_missing_flavor_and_duplicate_json_refused(self):
        candidate = record(); del candidate['images']['enterprise']
        with self.assertRaises(ValueError): release.validate(candidate, SHA, release.ORDER)
        with self.assertRaises(ValueError): json.loads('{"digest":"first","digest":"other"}', object_pairs_hook=release.unique_object)

    def test_runtime_source_and_flavor_are_verified(self):
        candidate = record()
        image = {'Id': candidate['images']['ui']['imageId'], 'Os': 'linux', 'Architecture': 'amd64',
                 'Config': {'Env': ['SOURCE_COMMIT=' + SHA, 'BUILD_VERSION=123'],
                            'Labels': {'org.opencontainers.image.revision': SHA, 'io.naumi.build.flavor': 'ui'}}}
        release.verify_image(image, candidate, 'ui')
        image['Config']['Labels']['io.naumi.build.flavor'] = 'desktop'
        with self.assertRaises(ValueError): release.verify_image(image, candidate, 'ui')

    def test_merge_keeps_ui_desktop_enterprise_port_order(self):
        with tempfile.TemporaryDirectory() as root:
            root = pathlib.Path(root)
            for flavor in reversed(release.ORDER):
                candidate = record(); candidate['images'] = {flavor: candidate['images'][flavor]}
                release.write_json(root / ('image-' + flavor + '.json'), candidate)
            output = root / 'merged.json'
            release.merge(argparse.Namespace(directory=root, output=output, flavors=json.dumps(release.ORDER)))
            self.assertEqual(list(release.read_json(output)['images']), list(release.ORDER))
            candidate['provenance']['runId'] = '9999'
            release.write_json(root / 'image-ui.json', candidate)
            with self.assertRaises(ValueError): release.merge(argparse.Namespace(directory=root, output=output, flavors=json.dumps(release.ORDER)))

    def test_bad_offline_package_never_calls_docker(self):
        with tempfile.TemporaryDirectory() as root:
            root = pathlib.Path(root); candidate = record()
            for flavor, row in candidate['images'].items():
                name = 'naumi-' + flavor + '-' + SHA + '.tar.gz'
                (root / name).write_bytes(b'valid')
                row['offline'] = {'name': name, 'sha256': release.sha256(root / name), 'bytes': 5}
            manifest = root / 'release-manifest.json'; release.write_json(manifest, candidate)
            (root / candidate['images']['enterprise']['offline']['name']).write_bytes(b'wrong')
            with patch.object(release.shutil, 'disk_usage', return_value=argparse.Namespace(free=20 * 1024**3)), patch.object(release, 'checked') as docker:
                with self.assertRaises(ValueError): release.prepare(argparse.Namespace(manifest=manifest, expected_sha=SHA, flavors=','.join(release.ORDER), directory=root/'prepared', offline_directory=root))
                docker.assert_not_called()
                self.assertFalse((root / 'prepared').exists())

    def test_wrong_workflow_run_never_downloads_images(self):
        with tempfile.TemporaryDirectory() as root:
            root = pathlib.Path(root); candidate = record()
            tag = 'codex-image-' + SHA + '-run1234-a1'
            def gh(command):
                if command[1:3] == ['release', 'view']:
                    return json.dumps({'isDraft': False, 'tagName': tag}).encode()
                if command[1:3] == ['release', 'download']:
                    self.assertIn('release-manifest.json', command)
                    release.write_json(root/'incoming'/'release-manifest.json', candidate)
                    return b''
                return json.dumps({'status':'completed','conclusion':'success','workflowName':'Build & push Docker image','headSha':'c'*40,'attempt':1}).encode()
            with patch.object(release, 'checked', side_effect=gh):
                with self.assertRaises(ValueError): release.fetch(argparse.Namespace(tag=tag, expected_sha=SHA, directory=root/'incoming', flavors=','.join(release.ORDER), offline=True))

    def test_classic_and_containerd_ids_bind_to_same_archive_configuration(self):
        with tempfile.TemporaryDirectory() as root:
            candidate=record(); row=candidate['images']['ui']
            config=b'{"architecture":"amd64","os":"linux","config":{}}'
            config_id='sha256:'+hashlib.sha256(config).hexdigest();row['imageId']=config_id
            manifest=json.dumps({'config':{'digest':config_id}}).encode()
            manifest_id='sha256:'+hashlib.sha256(manifest).hexdigest()
            archive_path=pathlib.Path(root)/'package.tar.gz'
            entries={'manifest.json':json.dumps([{'Config':'blobs/sha256/'+config_id[7:],'RepoTags':[row['tag']]}]).encode(),
                     'index.json':json.dumps({'manifests':[{'digest':manifest_id}]}).encode(),
                     'blobs/sha256/'+config_id[7:]:config,'blobs/sha256/'+manifest_id[7:]:manifest}
            with tarfile.open(archive_path,'w:gz')as archive:
                for name,body in entries.items():
                    entry=tarfile.TarInfo(name);entry.size=len(body);archive.addfile(entry,io.BytesIO(body))
            self.assertEqual(release.archive_image_ids(archive_path,row),{config_id,manifest_id})
            row['imageId']='sha256:'+'f'*64
            with self.assertRaises(ValueError):release.archive_image_ids(archive_path,row)

    def test_pulled_digest_must_match_even_when_engine_id_format_differs(self):
        candidate=record();row=candidate['images']['ui']
        image={'Id':'sha256:'+'f'*64,'Os':'linux','Architecture':'amd64','RepoDigests':[row['reference']],
               'Config':{'Env':['SOURCE_COMMIT='+SHA,'BUILD_VERSION=123'],'Labels':{'org.opencontainers.image.revision':SHA,'io.naumi.build.flavor':'ui'}}}
        release.verify_image(image,candidate,'ui',pulled=True)
        image['RepoDigests']=[release.IMAGE+'@sha256:'+'e'*64]
        with self.assertRaises(ValueError):release.verify_image(image,candidate,'ui',pulled=True)


if __name__ == '__main__':
    unittest.main()
