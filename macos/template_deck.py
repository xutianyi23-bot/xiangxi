"""Create a new presentation from a user's PowerPoint master, layouts and example slides."""
# Copyright © 2026 鸡腿堡
import io
import copy
import json
import posixpath
import sys
from zipfile import ZipFile, ZIP_DEFLATED
from xml.etree import ElementTree as E

P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
for prefix, ns in [('p', P), ('a', A), ('r', R)]:
    E.register_namespace(prefix, ns)
ns = {'p': P, 'a': A}
aliases={}
def parse(data):
    for _,pair in E.iterparse(io.BytesIO(data),events=('start-ns',)):
        prefix,uri=pair
        if prefix:aliases[prefix]=uri
    return E.fromstring(data)
def xml(el):
    # MC attributes use literal prefixes that ElementTree would otherwise drop.
    material=E.tostring(el,encoding='unicode')
    needed=set()
    for n in el.iter():
        for key,value in n.attrib.items():
            if key.endswith('}Ignorable') or key=='Requires':needed.update(value.split())
    for prefix in needed:
        if prefix in aliases and ('xmlns:'+prefix+'=') not in material:el.set('xmlns:'+prefix,aliases[prefix])
    return E.tostring(el, encoding='utf-8', xml_declaration=True)
def relpath(part):
    return posixpath.join(posixpath.dirname(part), '_rels', posixpath.basename(part)+'.rels')
def resolve(part, target):
    return posixpath.normpath(posixpath.join(posixpath.dirname(part),target)).lstrip('/')
def paragraphs(shape, lines):
    body=shape.find('p:txBody', ns)
    existing=body.findall('a:p', ns)
    proto=existing[0] if existing else E.Element('{%s}p'%A)
    for p in existing: body.remove(p)
    for line in lines:
        p=copy.deepcopy(proto)
        for child in list(p):
            if child.tag!='{%s}pPr'%A:p.remove(child)
        r=E.SubElement(p,'{%s}r'%A)
        fmt=proto.find('.//a:rPr',ns)
        if fmt is not None:r.append(copy.deepcopy(fmt))
        E.SubElement(r,'{%s}t'%A).text=line
        body.append(p)
def build(src,dst,slides):
    with ZipFile(src) as zin:
        if sum(i.file_size for i in zin.infolist())>180*1024*1024:raise ValueError('模板解压尺寸过大')
        files=set(zin.namelist())
        root='ppt/presentation.xml'
        pres=parse(zin.read(root));pr=E.fromstring(zin.read(relpath(root)))
        sl=pres.find('p:sldIdLst',ns)
        if sl is None:raise ValueError('模板缺少示例幻灯片')
        by_id={r.get('Id'):resolve(root,r.get('Target')) for r in pr}
        source=[by_id[x.get('{%s}id'%R)] for x in sl]
        if not source:raise ValueError('模板至少需要一页带标题及正文的示例')
        prototypes=[]
        for part in source[:35]:
            page=parse(zin.read(part))
            shapes=page.findall('p:cSld/p:spTree/p:sp',ns)
            boxes=[s for s in shapes if s.find('p:txBody',ns) is not None and (s.find('.//p:ph',ns) is not None or ''.join(s.itertext()).strip())]
            def ph(s):
                v=s.find('.//p:ph',ns)
                return v.get('type','obj') if v is not None else ''
            boxes=[s for s in boxes if ph(s) not in ['dt','ftr','sldNum','hdr']]
            if len(boxes)<2:continue
            title=next((s for s in boxes if ph(s) in ('title','ctrTitle')),boxes[0])
            body=next((s for s in boxes if s is not title and ph(s) in ('body','obj','subTitle')),next(s for s in boxes if s is not title))
            prototypes.append((part,page,title,body,boxes))
        if not prototypes:raise ValueError('模板需要一页含可编辑标题和正文的示例页。')
        for node in list(sl):sl.remove(node)
        for tag in ['custShowLst','sectionLst','extLst']:
            for n in pres.findall('p:'+tag,ns):pres.remove(n)
        for r in list(pr):
            if r.get('Type','').endswith('/slide'):pr.remove(r)
        parts={}; types=E.fromstring(zin.read('[Content_Types].xml'))
        for node in list(types):
            if '/slides/slide' in node.get('PartName',''):types.remove(node)
            if node.get('PartName')=='/'+root:node.set('ContentType','application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml')
        for i,data in enumerate(slides,1):
            original,page,title,body,boxes=prototypes[min(i-1,len(prototypes)-1)]
            page,title,body,boxes=copy.deepcopy((page,title,body,boxes))
            paragraphs(title,[data['title']]);paragraphs(body,data['points'])
            for shape in boxes:
                if shape is not title and shape is not body:paragraphs(shape,[])
            part='ppt/slides/generated%d.xml'%i
            parts[part]=xml(page);parts[relpath(part)]=zin.read(relpath(original))
            rid='generatedSlide%d'%i
            E.SubElement(sl,'{%s}sldId'%P,{'id':str(255+i),'{%s}id'%R:rid})
            E.SubElement(pr,'{%s}Relationship'%REL,Id=rid,Type=R+'/slide',Target=part[4:])
            E.SubElement(types,'{%s}Override'%CT,PartName='/'+part,ContentType='application/vnd.openxmlformats-officedocument.presentationml.slide+xml')
        parts[root]=xml(pres);parts[relpath(root)]=xml(pr)
        def read(p):return parts[p] if p in parts else zin.read(p)
        emitted=set()
        with ZipFile(dst,'w',ZIP_DEFLATED) as zout:
            def copy_part(part):
                if part in emitted:return
                emitted.add(part)
                if part:zout.writestr(part,read(part))
                rp=relpath(part)
                if rp not in parts and rp not in files:return
                rels=E.fromstring(read(rp))
                for r in list(rels):
                    kind=r.get('Type','').rsplit('/',1)[-1]
                    dest=resolve(part,r.get('Target',''))
                    if r.get('TargetMode')=='External' or kind in ('notesSlide','comments','commentAuthors','tags','customXml','oleObject','package','vbaProject','thumbnail') or (kind=='slide' and dest not in parts) or (dest not in files and dest not in parts):
                        rels.remove(r);continue
                    copy_part(dest)
                zout.writestr(rp,xml(rels))
            copy_part('')
            for node in list(types):
                if node.tag.endswith('Override') and node.get('PartName','')[1:] not in emitted:types.remove(node)
            zout.writestr('[Content_Types].xml',xml(types))
if __name__=='__main__':
    try:build(sys.argv[1],sys.argv[2],json.load(sys.stdin))
    except Exception as exc:sys.exit('无法应用此模板：'+str(exc))
