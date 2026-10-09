#!/usr/bin/env python3
"""Render a strict protected OSS probe env without shell evaluation or secrets in logs."""
import importlib.util
import os
import re
import stat
import sys
from pathlib import Path

spec=importlib.util.spec_from_file_location('osscheck',Path(__file__).with_name('verify-oss-compose.py'))
check=importlib.util.module_from_spec(spec);spec.loader.exec_module(check)

def render(source, dest):
    info=source.lstat()
    assert stat.S_ISREG(info.st_mode) and info.st_uid==os.getuid(), 'owned regular file'
    assert not (stat.S_IMODE(info.st_mode) & 0o077), 'protected file'
    fields={}
    for line in source.read_text(encoding='utf-8-sig').splitlines():
        line=line.strip()
        if not line or line.startswith('#'):continue
        match=re.fullmatch(r'(NAUMI_OSS_[A-Z_]+)=(.*)',line)
        assert match, 'strict key-value format'
        key,value=match.groups()
        assert key not in fields, 'duplicate field'
        value=value.strip()
        if value.startswith(('"',"'")):
            assert len(value)>=2 and value[-1]==value[0], 'balanced quoted value'
            value=value[1:-1]
        assert not any(c in value for c in '\r\n\x00$`'), 'literal value only'
        fields[key]=value
    names=('ENDPOINT','REGION','ACCESS_KEY_ID','SECRET_ACCESS_KEY','BUCKET')
    assert set(fields)=={'NAUMI_OSS_'+n for n in names}, 'required field set'
    env={'S3_'+n:fields['NAUMI_OSS_'+n] for n in names}
    check.verify_storage(env)
    env.update(STORAGE_DRIVER='s3', S3_FORCE_PATH_STYLE='false', S3_PUBLIC_BASE_URL='', DATABASE_URL='')
    fd=os.open(dest,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w',encoding='utf-8',newline='\n') as f:
        f.write(''.join(k+'='+v+'\n' for k,v in env.items()))
    return env

if __name__=='__main__':
    try: render(Path(sys.argv[1]),Path(sys.argv[2]))
    except (AssertionError,KeyError,ValueError,IndexError,OSError):
        print('OSS_PROBE_CONFIG=FAIL CONFIG_REDACTED=1');sys.exit(78)
    print('OSS_PROBE_CONFIG=PASS STRICT_LITERAL=1 MODE=0600 VALUES_PRINTED=0')
