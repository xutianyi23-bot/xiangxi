"""Read new INBOX UIDs with TLS and BODY.PEEK. Credentials arrive only on stdin."""
# Copyright © 2026 鸡腿堡
import datetime
import email
from email import policy
from html.parser import HTMLParser
import imaplib
import json
import re
import ssl
import sys

class BodyText(HTMLParser):
    def __init__(self):
        super().__init__();self.parts=[];self.hidden=0
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style'):self.hidden+=1
        if tag in ('p','div','br','li','tr'):self.parts.append('\n')
    def handle_endtag(self,tag):
        if tag in ('script','style'):self.hidden=max(0,self.hidden-1)
    def handle_data(self,data):
        if not self.hidden:self.parts.append(data)

def read_box(config):
    with imaplib.IMAP4_SSL(config['host'],int(config['port']),ssl_context=ssl.create_default_context(),timeout=20) as box:
        box.login(config['user'],config['secret'])
        if box.select('INBOX',readonly=True)[0]!='OK':raise ValueError('无法读取 INBOX')
        epoch=box.response('UIDVALIDITY')[1][0].decode('ascii')
        cursor=int(config.get('cursor') or 0) if config.get('epoch')==epoch else 0
        since=(datetime.date.today()-datetime.timedelta(days=7)).strftime('%d-%b-%Y')
        status,raw=box.uid('search',None,'UID',str(cursor+1)+':*') if cursor else box.uid('search',None,'SINCE',since)
        if status!='OK':raise ValueError('邮件索引不可用')
        ids=sorted(int(i) for i in raw[0].split() if int(i)>cursor)
        out=[]
        for uid in ids[:12]:
            status,meta=box.uid('fetch',str(uid),'(RFC822.SIZE)')
            size=re.search(rb'RFC822.SIZE (\d+)',b' '.join(v for v in meta if isinstance(v,bytes)))
            if status!='OK' or not size:raise ValueError('邮件大小读取失败，请重试')
            large=int(size.group(1))>24_000_000
            status,data=box.uid('fetch',str(uid),'(BODY.PEEK[HEADER])' if large else '(BODY.PEEK[])')
            binary=next((t[1] for t in data if isinstance(t,tuple)),None)
            if status!='OK' or binary is None:raise ValueError('邮件读取失败，请重试')
            msg=email.message_from_bytes(binary,policy=policy.default)
            part=msg.get_body(preferencelist=('plain','html'))
            body=part.get_content() if part and not large else ''
            if part and part.get_content_subtype()=='html':
                html=BodyText();html.feed(body);body=''.join(html.parts)
            out.append(dict(uid=uid,mid=str(msg.get('Message-ID','')),subject=str(msg.get('Subject','')),sender=str(msg.get('From','')),date=str(msg.get('Date','')),body=body,issue='邮件超过 24 MB，请粘贴审稿正文。' if large else ''))
        return dict(epoch=epoch,cursor=ids[min(12,len(ids))-1] if ids else cursor,more=len(ids)>12,items=out)
if __name__=='__main__':
    try:json.dump(read_box(json.load(sys.stdin)),sys.stdout,ensure_ascii=False)
    except imaplib.IMAP4.error:sys.exit('IMAP 请求失败，请核对账号、授权码及收件箱权限。')
    except Exception as e:sys.exit('读取邮箱失败：'+str(e)[:180])
