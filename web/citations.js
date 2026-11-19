'use strict';

function citationText(ref){
 const title=paperTitleText(ref.title);
 const authors=Array.isArray(ref.authors)?ref.authors.join(', '):ref.authors;
 const type=ref.refType||(/笔记|实验方案|研究资料|文献调研|实验索引/.test(ref.kind||'')?'Z':/学位/.test(ref.kind||'')?'D':/专著/.test(ref.kind||'')?'M':'J');
 const volume=[ref.volume,ref.issue&&'('+ref.issue+')'].filter(Boolean).join('');
 const journal=[ref.journal,ref.year,volume].filter(Boolean).join(', ');
 const publication=[journal,ref.pages].filter(Boolean).join(': ');
 const doi=(ref.doi||(/^10\.\d+\//.test(ref.source||'')?ref.source:'')).replace(/^https?:\/\/doi\.org\//i,'');
 const parts=[authors,title.replace(/[.。]$/,'')+'['+type+']',publication,doi?'DOI: '+doi:ref.articleURL];
 return parts.filter(Boolean).join('. ').replace(/[.。]$/,'')+'.';
}
function citationLine(ref,index){return '['+(index+1)+'] '+citationText(ref)}
function sourceList(s,plan){
 return (plan?.refs||[]).map((id,i)=>{
  const ref=references(s).find(r=>r.id===id)||s.removedCitations?.[id];
  return ref?citationLine(ref,i):s.removedCitationTitles?.[id]?citationLine({title:s.removedCitationTitles[id]},i):'['+(i+1)+'] 题录缺失';
 }).join('\n');
}
function citationBlock(s,plan){
 const lines=sourceList(s,plan);
 return lines?'<div class="bibliography"><strong>参考文献</strong>'+noteBlock(lines)+'</div>':'<p class="small">尚未关联参考文献</p>';
}
