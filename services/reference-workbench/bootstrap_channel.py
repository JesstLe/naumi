"""从部署环境初始化TDH渠道；密钥只存加密库，不写入日志。"""
import asyncio
import json
import os
import time
import httpx
import app


async def main():
    app.CLIENT = httpx.AsyncClient(trust_env=False, timeout=60)
    base = await app.checked_origin(os.environ['BOOTSTRAP_BASE'])
    ch = {'base': base, 'secret': app.CIPHER.encrypt(os.environ['BOOTSTRAP_API_KEY'].encode()).decode()}
    try:
        response = await app.upstream(ch, '/models', method='GET')
        models = list(dict.fromkeys(str(x['id']) for x in response.json()['data'] if x.get('id')))
        image = os.environ.get('BOOTSTRAP_IMAGE_MODEL', 'gpt-image-2')
        text = os.environ.get('BOOTSTRAP_TEXT_MODEL', 'gpt-5.6-luna')
        assert image in models, 'Image model not in key-visible catalog'
        assert text in models, 'Text model not in key-visible catalog'
        with app.db() as c:
            c.execute('UPDATE channels SET active=0')
            c.execute('INSERT OR REPLACE INTO channels VALUES (?,?,?,?,?,?,?,?,?)', ('tdh-initial', 'TDH', base, ch['secret'], json.dumps(models), image, text, time.time(), 1))
        print('TDH_DISCOVERY=PASS MODELS=' + str(len(models)) + ' IMAGE=' + image + ' TEXT=' + text + ' GENERATION=UNVERIFIED')
    finally:
        await app.CLIENT.aclose()


if __name__ == '__main__':
    asyncio.run(main())
