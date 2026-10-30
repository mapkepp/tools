#!/usr/bin/env python3
"""Ephemeral public runner for an encrypted ASR test. No plaintext audio/text in GitHub.

Source repository public; the payload and output are AEAD encrypted with X25519
and never written to GitHub as plaintext. Private server keys stay in RAM only.
"""
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

REPO=os.environ.get('GITHUB_REPOSITORY','mapkepp/tools')
BRANCH=os.environ.get('GITHUB_REF_NAME','asr-private-compute-probe-2026-10-30')
TOKEN=os.environ.get('GITHUB_TOKEN','')
ROOT='ci/asr-run'
OUT=Path(__file__).parent/'output'

def b64(raw):return base64.b64encode(raw).decode('ascii')
def ub64(raw):return base64.b64decode(raw,validate=True)
def sha(raw):return hashlib.sha256(raw).hexdigest()

def api(method,path,payload=None):
    url='https://api.github.com/repos/'+REPO+'/contents/'+path+'?ref='+urllib.parse.quote(BRANCH,safe='') if method=='GET' else 'https://api.github.com/repos/'+REPO+'/contents/'+path
    headers={'Accept':'application/vnd.github+json','User-Agent':'mapkepp-asr-ephemeral-worker','X-GitHub-Api-Version':'2022-11-28'}
    if TOKEN:headers['Authorization']='Bearer '+TOKEN
    data=None if payload is None else json.dumps(payload).encode('utf-8')
    if data:headers['Content-Type']='application/json'
    req=urllib.request.Request(url,headers=headers,data=data,method=method)
    try:
        with urllib.request.urlopen(req,timeout=30) as result:return json.load(result)
    except urllib.error.HTTPError as err:
        if err.code==404 and method=='GET':return None
        raise RuntimeError(f'GitHub API {method} {path}: HTTP {err.code}') from err

def read_remote(path):
    obj=api('GET',path)
    if obj is None:return None
    if obj.get('encoding')!='base64' or not isinstance(obj.get('content'),str):
        raise RuntimeError('GitHub API returned unexpected file encoding')
    return ub64(''.join(obj['content'].split()))

def write_json(path,obj):
    old=api('GET',path)
    data={'message':'ASR: publish ephemeral public key (no private key)','branch':BRANCH,
          'content':b64(json.dumps(obj,sort_keys=True).encode('utf8'))}
    if old is not None:data['sha']=old['sha']
    api('PUT',path,data)


def derive(private,public_b64,salt,info):
    remote=X25519PublicKey.from_public_bytes(ub64(public_b64))
    shared=private.exchange(remote)
    return HKDF(algorithm=hashes.SHA256(),length=32,salt=salt.encode('ascii'),info=info).derive(shared)

def wait_ready(session,mode):
    started=time.monotonic()
    while time.monotonic()-started<900:
        data=read_remote(ROOT+'/data/READY.json')
        if data:
            try:obj=json.loads(data)
            except ValueError:raise RuntimeError('Invalid READY.json')
            if obj.get('session_id')==session and obj.get('mode')==mode:return obj
        time.sleep(10)
    raise RuntimeError('Timed out waiting for encrypted payload')

def run():
    if not TOKEN:raise RuntimeError('GitHub workflow token unavailable')
    start=json.loads((Path(__file__).parent/'START.txt').read_text(encoding='utf8'))
    mode=start.get('mode')
    if mode not in {'test','real'}:raise RuntimeError('Invalid START mode')
    private=X25519PrivateKey.generate()
    public=b64(private.public_key().public_bytes(serialization.Encoding.Raw,serialization.PublicFormat.Raw))
    session=secrets.token_hex(16)
    write_json(ROOT+'/PUBKEY.json',{'protocol':'X25519-HKDF-SHA256-AESGCM-v1','session_id':session,'public_key':public,
                                   'start_sha':os.environ.get('GITHUB_SHA'),'mode':mode})
    print('EPHEMERAL_PUBLIC_KEY_PUBLISHED, mode=',mode,flush=True)
    ready=wait_ready(session,mode)
    payload_key=derive(private,ready['client_public_key'],session,b'asr-payload-v1')
    result_key=derive(private,ready['client_public_key'],session,b'asr-result-v1')
    aes=AESGCM(payload_key)
    frames={}
    for row in ready['chunks']:
        name=row['name']
        if not name.startswith('piece_') or not name.endswith('.bin') or '/' in name or '..' in name:
            raise RuntimeError('Invalid encrypted chunk name')
        ct=None
        for attempt in range(24):
            ct=read_remote(ROOT+'/data/'+name)
            if ct is not None and sha(ct)==row['cipher_sha256']:
                break
            if attempt in (0,8,16):
                print('WAIT_ENCRYPTED_CHUNK',name,'present',ct is not None,'actual_len',len(ct) if ct is not None else 0,'expected_len',row.get('length'),flush=True)
            time.sleep(5)
        else:
            raise RuntimeError('Encrypted chunk missing/integrity mismatch after retries, name='+name)
        aad=(session+'/'+name).encode('ascii')
        plaintext=aes.decrypt(ub64(row['nonce']),ct,aad)
        frames.setdefault(int(row['part']),[]).append((int(row['index']),plaintext))
    print('ALL_ENCRYPTED_PIECES_VERIFIED',len(ready['chunks']),flush=True)
    with tempfile.TemporaryDirectory() as temp:
        temp=Path(temp)
        if mode=='test':
            assert frames=={0:[(0,b'asr-test-payload-check')]},'Test payload mismatch'
            result={'status':'CRYPTO_ROUNDTRIP_PASS','no_user_audio':True,'session_id':session}
        else:
            audio_paths=[]
            for p in range(4):
                rows=sorted(frames[p])
                if [n for n,_ in rows]!=list(range(len(rows))):raise RuntimeError('Noncontiguous audio part')
                blob=b''.join(v for _,v in rows)
                expected=ready['audio_parts'][p]
                if sha(blob)!=expected['sha256'] or len(blob)!=expected['size']:
                    raise RuntimeError('Reassembled audio SHA/size mismatch')
                path=temp/f'audio_{p}.mp3';path.write_bytes(blob);audio_paths.append(path)
            del frames,rows,blob
            result=recognize(audio_paths,ready)
        raw=json.dumps(result,ensure_ascii=False).encode('utf8')
        nonce=secrets.token_bytes(12)
        ct=AESGCM(result_key).encrypt(nonce,raw,session.encode('ascii'))
        OUT.mkdir(parents=True,exist_ok=True)
        (OUT/'result.enc').write_bytes(nonce+ct)
        print('ENCRYPTED_RESULT_CREATED',len(raw),'bytes payload',flush=True)
    # GITHUB_ACTIONS runner is ephemeral. No plaintext transcript is uploaded.

def recognize(paths,ready):
    print('INSTALL_AND_LOAD_FREE_WHISPER_MODEL',flush=True)
    subprocess.run([sys.executable,'-m','pip','install','--disable-pip-version-check','faster-whisper==1.2.1'],check=True,
                   stdout=subprocess.DEVNULL)
    from faster_whisper import WhisperModel
    model=WhisperModel('small',device='cpu',compute_type='int8',cpu_threads=4,num_workers=1)
    all_segments=[]
    for idx,path in enumerate(paths):
        print('TRANSCRIBE_SHARD',idx,flush=True)
        it,info=model.transcribe(str(path),language='ru',task='transcribe',beam_size=3,best_of=3,
                                 condition_on_previous_text=False,word_timestamps=True,
                                 vad_filter=True,vad_parameters={'min_silence_duration_ms':800})
        offset=idx*1200
        for s in it:
            if not s.text.strip():continue
            item={'start':round(s.start+offset,3),'end':round(s.end+offset,3),
                  'text':s.text.strip(),'speaker_id':None,'speaker_status':'UNKNOWN',
                  'asr_status':'UNVERIFIED'}
            if s.words:
                item['words']=[{'start':round(w.start+offset,3),'end':round(w.end+offset,3),'word':w.word}
                               for w in s.words if w.start is not None and w.end is not None]
            all_segments.append(item)
        print('SHARD_FINISHED',idx,'turns_so_far',len(all_segments),flush=True)
    all_segments.sort(key=lambda x:x['start'])
    if not all_segments or all_segments[-1]['end']<3600:
        raise RuntimeError('Missing transcript or tail, refusing to publish')
    result={'status':'ASR_UNVERIFIED','speaker_status':'NOT_IDENTIFIED','language':'ru','model':'Whisper-small','source':'recording uploaded by owner',
            'input_original_duration':ready.get('source_duration'),'segments':all_segments}
    return result

if __name__=='__main__':
    try:run()
    except Exception as exc:
        # Never print recording text or secrets, only failure class and a bounded message.
        print('PROCESSING_FAILED',type(exc).__name__,str(exc)[:150],file=sys.stderr,flush=True)
        sys.exit(1)