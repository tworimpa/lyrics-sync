/* Lyrics Sync Studio 4.0 — lyrics and subtitle timing only. */
(function (root) {
'use strict';
const FORMAT = 'zerosu-lyrics-sync';
const LIMIT = { rows: 1000, text: 2000, title: 200, section: 120, seconds: 86400 };
const clone = x => JSON.parse(JSON.stringify(x));
const round = x => Math.round((x + Number.EPSILON) * 1000) / 1000;
function uid(prefix='id') {
  return prefix + '_' + (root.crypto?.randomUUID ? root.crypto.randomUUID() : Date.now().toString(36)+'_'+Math.random().toString(36).slice(2)+'_'+Math.random().toString(36).slice(2));
}
function str(x, name, max, empty=false) {
  if(typeof x !== 'string' || (!empty && !x.trim()) || x.length>max) throw Error(name+' 형식을 확인하세요.');
  return x.trim();
}
function number(x, name, allowNull=true) {
  if(x === null && allowNull) return null;
  if(typeof x !== 'number' || !Number.isFinite(x) || x<0 || x>LIMIT.seconds) throw Error(name+'은 0~86,400 사이의 초 단위 숫자여야 합니다.');
  return round(x);
}
function fresh(title='새 프로젝트') {
  const now=new Date().toISOString();
  return {format:FORMAT,version:3,projectId:uid('project'),title:str(title,'제목',LIMIT.title),timeUnit:'seconds',duration:null,
    audio:{fileName:null,size:null,type:null,lastModified:null,sha256:null},rows:[],
    editor:{selectedRowId:null,playbackRate:1},createdAt:now,updatedAt:now};
}
function normalize(raw, fallbackTitle='불러온 프로젝트') {
  if(!raw || typeof raw!=='object' || Array.isArray(raw)) throw Error('프로젝트 JSON 객체가 아닙니다.');
  if(![1,2,3,4].includes(raw.version)) throw Error('지원하는 프로젝트 버전은 1, 2, 3, 4입니다.');
  const legacy=raw.version===1;
  if(!legacy && raw.format && raw.format!==FORMAT) throw Error('다른 프로그램의 프로젝트 형식입니다.');
  if(raw.timeUnit && raw.timeUnit!=='seconds') throw Error('초(seconds) 단위 프로젝트만 지원합니다.');
  if(!Array.isArray(raw.rows) || raw.rows.length>LIMIT.rows) throw Error('가사는 최대 '+LIMIT.rows+'줄까지 지원합니다.');
  const p=fresh(raw.title || (legacy && raw.song==='jerry-original-233544-v1' ? '내일의 앵무새 제리' : fallbackTitle));
  if(!legacy) p.projectId=str(raw.projectId,'프로젝트 ID',160);
  p.duration=number(raw.duration??null,'음원 길이');
  if(p.duration===0) p.duration=null;
  const seen=new Set(), sectionLabels=new Map();
  let prevLabel=null, group=null;
  p.rows=raw.rows.map((r,i)=>{
    if(!r || typeof r!=='object') throw Error((i+1)+'번 가사 형식 오류');
    const text=str(r.text,(i+1)+'번 가사',LIMIT.text);
    if(/\n\s*\n/.test(text)) throw Error((i+1)+'번 가사 내부의 빈 줄은 제거하세요.');
    const section=str(r.section??'구간 미지정','구간명',LIMIT.section);
    if(section!==prevLabel){group=uid('section');prevLabel=section;}
    const id=legacy?uid('lyric'):str(r.id,'가사 ID',160);
    if(seen.has(id)) throw Error('중복 가사 ID: '+id);
    seen.add(id);
    const sectionId=legacy?group:(r.sectionId?str(r.sectionId,'구간 ID',160):group);
    if(sectionLabels.has(sectionId)&&sectionLabels.get(sectionId)!==section) throw Error('동일한 구간 ID에 서로 다른 구간명이 있습니다.');
    sectionLabels.set(sectionId,section);
    return {id,sectionId,section,text,start:number(r.start??null,(i+1)+'번 시작'),end:number(r.end??null,(i+1)+'번 종료')};
  });
  if(raw.audio && typeof raw.audio==='object') {
    const a=raw.audio;
    p.audio.fileName=a.fileName==null?null:str(a.fileName,'음원 파일명',500);
    p.audio.type=a.type==null?null:str(a.type,'음원 유형',150,true);
    for(const k of ['size','lastModified']) {
      if(a[k]!=null && (!Number.isSafeInteger(a[k])||a[k]<0)) throw Error('음원 '+k+' 형식 오류');
      p.audio[k]=a[k]??null;
    }
    if(a.sha256!=null && (typeof a.sha256!=='string'||!/^[a-f\d]{64}$/i.test(a.sha256))) throw Error('음원 해시 형식 오류');
    p.audio.sha256=a.sha256?.toLowerCase()??null;
  }
  if(typeof raw.song==='string') p.sourceSong=raw.song.slice(0,200);
  if(typeof raw.sourceSong==='string') p.sourceSong=raw.sourceSong.slice(0,200);
  const selected=legacy?p.rows[Math.max(0,Math.min(p.rows.length-1,raw.selected|0))]?.id:raw.editor?.selectedRowId;
  p.editor.selectedRowId=seen.has(selected)?selected:(p.rows[0]?.id??null);
  const speed=raw.editor?.playbackRate;
  p.editor.playbackRate=[0.5,0.65,0.75,0.85,1,1.25,1.5].includes(speed)?speed:1;

  for(const k of ['createdAt','updatedAt']) if(typeof raw[k]==='string' && Number.isFinite(Date.parse(raw[k]))) p[k]=raw[k];
  return p;
}
function parseLyrics(source) {
  if(typeof source!=='string' || source.length>2_100_000) throw Error('가사 텍스트가 너무 큽니다.');
  let section='구간 미지정',sectionId=uid('section'),rows=[];
  for(const raw of source.replace(/^\uFEFF/,'').split(/\r?\n/)) {
    const line=raw.trim(); if(!line)continue;
    const m=line.match(/^\[([^\[\]]+)\]$/);
    if(m){section=str(m[1],'구간명',LIMIT.section);sectionId=uid('section');continue;}
    if(line.length>LIMIT.text) throw Error('가사 한 줄은 '+LIMIT.text+'자 이하여야 합니다.');
    rows.push({id:uid('lyric'),sectionId,section,text:line,start:null,end:null});
    if(rows.length>LIMIT.rows)throw Error('가사는 최대 '+LIMIT.rows+'줄입니다.');
  }
  return rows;
}
function lyricsText(rows) {
  let prev=null,lines=[];
  for(const r of rows){if(r.sectionId!==prev){lines.push('['+r.section+']');prev=r.sectionId;}lines.push(r.text);}
  return lines.join('\n');
}
function reconcile(oldRows, source, mode='safe') {
  const rows=parseLyrics(source);
  if(mode!=='reset' && rows.length===oldRows.length && rows.every((r,i)=>r.text===oldRows[i].text && r.section===oldRows[i].section && (!i || (r.sectionId===rows[i-1].sectionId)===(oldRows[i].sectionId===oldRows[i-1].sectionId))))
    return {rows:clone(oldRows),kept:rows.length,cleared:0,ambiguous:0};
  const key=r=>JSON.stringify([r.section,r.text]);
  const oldMap=new Map(),count=new Map();
  for(const r of oldRows){const k=key(r);if(!oldMap.has(k))oldMap.set(k,[]);oldMap.get(k).push(r);}
  for(const r of rows)count.set(key(r),(count.get(key(r))||0)+1);
  let kept=0,ambiguous=0;const reused=new Set(),groupMaps=new Map();
  if(mode==='safe') for(const r of rows){
    const k=key(r),matches=oldMap.get(k)||[];
    if(matches.length===1 && count.get(k)===1){
      const o=matches[0];r.id=o.id;r.start=o.start;r.end=o.end;reused.add(o.id);kept++;
      if(!groupMaps.has(r.sectionId))groupMaps.set(r.sectionId,new Set());groupMaps.get(r.sectionId).add(o.sectionId);
    }else if(matches.length){ambiguous++;}
  }
  const usedGroups=new Set(),resolved=new Map();
  for(const [k,v] of groupMaps){if(v.size===1){const id=[...v][0];if(!usedGroups.has(id)){resolved.set(k,id);usedGroups.add(id);}}}
  for(const r of rows)if(resolved.has(r.sectionId))r.sectionId=resolved.get(r.sectionId);
  return {rows,kept,ambiguous,cleared:oldRows.filter(r=>(r.start!==null||r.end!==null)&&!reused.has(r.id)).length};
}
function validate(p) {
  let errors=[];let maxStart=-1,maxEnd=-1,maxEndRow=-1;
  p.rows.forEach((r,i)=>{
    const add=(code,msg)=>errors.push({rowId:r.id,index:i,code,message:(i+1)+'번: '+msg});
    if(['start','end'].some(k=>r[k]!==null&&(!Number.isFinite(r[k])||r[k]<0||r[k]>LIMIT.seconds)))add('invalid','유효하지 않은 시간');
    if(r.start===null||r.end===null)add('missing','시작 또는 종료 미입력');
    if(r.start!==null && r.end!==null && r.end<=r.start)add('order','종료가 시작보다 늦어야 합니다');
    if(p.duration!==null && (r.start>p.duration || r.end>p.duration))add('range','음원 길이를 초과합니다');
    if(r.start!==null){
      if(r.start<maxStart)add('sequence','앞선 가사보다 시작 시간이 빠릅니다');
      if(r.start<maxEnd)add('overlap',(maxEndRow+1)+'번 가사와 시간이 겹칩니다');
      maxStart=Math.max(maxStart,r.start);
    }
    if(r.end!==null && (r.start===null||r.end>r.start) && r.end>maxEnd){maxEnd=r.end;maxEndRow=i;}
  });
  return errors;
}
function shift(p, ids, delta) {
  if(!Number.isFinite(delta))throw Error('이동할 시간을 숫자로 입력하세요.');
  const chosen=new Set(ids),q=clone(p);let count=0;
  for(const r of q.rows)if(chosen.has(r.id)){
    if(r.start!==null||r.end!==null)count++;
    for(const k of ['start','end'])if(r[k]!==null){
      const t=round(r[k]+delta);
      if(t<0||t>LIMIT.seconds||(q.duration!==null&&t>q.duration))throw Error('이동 후 음원 범위를 벗어나는 시간이 있습니다. 어떤 시간도 변경하지 않았습니다.');
      r[k]=t;
    }
  }
  return {rows:q.rows,count};
}
function fmt(value,style='clock') {
  if(value===null||!Number.isFinite(value))return '—';
  const n=Math.max(0,Math.round(value*1000)),h=Math.floor(n/3600000),m=Math.floor(n/60000)%60,s=Math.floor(n/1000)%60,ms=n%1000;
  const p=(v,len=2)=>String(v).padStart(len,'0');
  return (style!=='clock'||h>0?p(h)+':':'')+p(m)+':'+p(s)+(style==='srt'?',':'.')+p(ms,3);
}
function subtitles(p,format='srt') {
  if(!['srt','vtt'].includes(format))throw Error('지원하지 않는 자막 형식');
  if(!p.rows.length)throw Error('먼저 가사를 입력하세요.');
  if(validate(p).length)throw Error('자막을 저장하려면 미입력·시간 오류를 먼저 수정하세요.');
  const body=p.rows.map((r,i)=>(format==='srt'?(i+1)+'\n':'')+fmt(r.start,format==='srt'?'srt':'vtt')+' --> '+fmt(r.end,format==='srt'?'srt':'vtt')+'\n'+(format==='vtt'?r.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'):r.text)+'\n').join('\n');
  return (format==='vtt'?'WEBVTT\n\n':'')+body;
}
function csv(p) {
  // Spreadsheet formula injection protection for all string cells.
  const cell=v=>{let s=String(v??'');if(typeof v==='string' && /^[\s\uFEFF]*[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  return '\uFEFF'+[['번호','구간','가사','시작_초','종료_초','가사_ID','구간_ID'],...p.rows.map((r,i)=>[i+1,r.section,r.text,r.start,r.end,r.id,r.sectionId])].map(r=>r.map(cell).join(',')).join('\r\n');
}
function filename(title) {
  let s=title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,100)||'Lyrics';
  if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(s))s='_'+s;
  return s;
}
function parseTime(x) {
  if(typeof x!=='string')throw Error('시간 문자열 오류');
  const m=x.trim().match(/^(?:(\d+):)?(\d{1,3}):(\d{2})(?:[.,](\d{1,3}))?$/);
  if(!m||Number(m[3])>59||(m[1]&&Number(m[2])>59))throw Error('시간 형식 오류: '+x);
  return number((Number(m[1]||0)*60+Number(m[2]))*60+Number(m[3])+Number((m[4]||'').padEnd(3,'0'))/1000,'자막 시간',false);
}
function plainCaption(text) {
  // Keep user text inert. Only remove known subtitle markup, never evaluate HTML.
  let s=text.replace(/<(?:\/?(?:b|i|u|c|v|lang|ruby|rt))(?:[.\s][^>]*)?>/gi,'').replace(/<\d{1,3}:\d{2}(?::\d{2})?[.]\d{3}>/g,'');
  s=s.replace(/&#(x[0-9a-f]+|\d+);/gi,(m,n)=>{const x=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return x>0&&x<=0x10ffff?String.fromCodePoint(x):m;});
  return s.replace(/&(lt|gt|amp|nbsp|quot|apos);/g,(m,n)=>({lt:'<',gt:'>',amp:'&',nbsp:' ',quot:'"',apos:"'"}[n]));
}
function importSubtitles(source,format) {
  if(typeof source!=='string'||source.length>5_000_000)throw Error('자막은 5MB 이하 텍스트여야 합니다.');
  source=source.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');const sectionId=uid('section'),warnings=[];let rows=[];
  const add=(text,start,end)=>{text=str(text,'자막 가사',LIMIT.text);rows.push({id:uid('lyric'),sectionId,section:'가져온 자막',text,start,end});if(rows.length>LIMIT.rows)throw Error('최대 1,000줄 초과');};
  if(format==='lrc') {
    const offsets=[...source.matchAll(/^\[offset:([+-]?\d+)\]\s*$/gmi)];
    if(offsets.length>1)throw Error('LRC offset은 하나만 지원합니다.');
    const offset=offsets.length?Number(offsets[0][1])/1000:0;
    if(offset)warnings.push('offset '+offset+'초를 적용했습니다 (양수는 앞당김).');
    const events=[];
    for(const line of source.split('\n')){
      if(!line.trim()||/^\[(?:ar|ti|al|by|offset|length|re|ve):[^\]]*\]\s*$/i.test(line.trim()))continue;
      const mm=line.match(/^((?:\[\d{1,5}:\d{2}(?:[.:]\d{1,3})?\])+)(.*)$/);
      if(!mm)throw Error('해석할 수 없는 LRC 줄: '+line.slice(0,80));
      const text=mm[2].trim();if(/<\d+:\d+/.test(text))throw Error('단어별 Enhanced LRC는 지원하지 않습니다. 줄 단위 LRC를 사용하세요.');
      for(const ts of mm[1].matchAll(/\[(\d+):(\d{2})(?:[.:](\d{1,3}))?\]/g)){
        if(Number(ts[2])>59)throw Error('잘못된 LRC 초');
        const t=round(Number(ts[1])*60+Number(ts[2])+Number((ts[3]||'').padEnd(3,'0'))/1000-offset);number(t,'LRC 시간',false);events.push({t,text});
        if(events.length>3000)throw Error('LRC 이벤트가 너무 많습니다.');
      }
    }
    events.sort((a,b)=>a.t-b.t);
    events.forEach((e,i)=>{if(e.text){const next=events.slice(i+1).find(x=>x.t>e.t);add(e.text,e.t,next?.t??null);}});
    warnings.push('LRC 종료는 다음 타임스탬프를 기준으로 채웠습니다. 마지막 종료와 간주를 직접 확인하세요.');
  } else if(format==='srt'||format==='vtt') {
    if(format==='vtt'&&!/^WEBVTT(?:[ \t].*)?(?:\n|$)/.test(source))throw Error('WEBVTT 헤더가 없습니다.');
    if(format==='vtt')source=source.replace(/^WEBVTT[^\n]*(?:\n|$)/,'');
    let ignored=0;
    for(const block of source.split(/\n[ \t]*\n/)){
      const lines=block.trim().split('\n');if(!lines[0])continue;
      if(format==='vtt'&&/^(NOTE(?:\s|$)|STYLE$|REGION$)/.test(lines[0])){ignored++;continue;}
      const at=lines.findIndex(l=>l.includes('-->'));if(at<0||at>1)throw Error('자막 블록에 시작 --> 종료가 없습니다.');
      const match=lines[at].match(/^\s*(\S+)\s+-->\s+(\S+)(.*)$/);if(!match)throw Error('자막 시간행 오류');
      const start=parseTime(match[1]),end=parseTime(match[2]);if(end<=start)throw Error('자막 종료는 시작보다 늦어야 합니다.');
      let text=lines.slice(at+1).join('\n').trim();if(!text)throw Error('빈 자막 블록입니다.');
      const clean=plainCaption(text);if(clean!==text||match[3].trim())ignored++;
      add(clean,start,end);
    }
    if(ignored)warnings.push('서식 태그·위치 설정·주석 '+ignored+'건은 텍스트 편집용으로 제거했습니다.');
  } else throw Error('SRT, VTT, 줄 단위 LRC만 지원합니다.');
  if(!rows.length)throw Error('가져올 자막이 없습니다.');return {rows,warnings};
}
function lrc(p) {
  if(!p.rows.length||validate(p).length)throw Error('LRC를 저장하려면 모든 시간 오류를 수정하세요.');
  const ts=t=>{const n=Math.round(t*1000);return '['+String(Math.floor(n/60000)).padStart(2,'0')+':'+String(Math.floor(n/1000)%60).padStart(2,'0')+'.'+String(n%1000).padStart(3,'0')+']';};
  const lines=['[ti:'+p.title.replace(/[\r\n\[\]]/g,' ')+']','[by:Lyrics Sync Studio]'];
  p.rows.forEach((r,i)=>{lines.push(ts(r.start)+r.text.replace(/\n/g,' '));if(!p.rows[i+1]||p.rows[i+1].start>r.end)lines.push(ts(r.end));});
  return lines.join('\n')+'\n';
}
function alignEnds(p,ids,gap=0) {
  if(!Number.isFinite(gap)||gap<0)throw Error('간격은 0 이상의 숫자');
  const q=clone(p),chosen=new Set(ids);let count=0;
  for(let i=0;i<q.rows.length;i++){const r=q.rows[i];if(!chosen.has(r.id)||r.start===null||r.end!==null)continue;
    const boundary=q.rows[i+1]?.start??(i===q.rows.length-1?q.duration:null);
    if(boundary===null||boundary-gap<=r.start)continue;r.end=round(boundary-gap);count++;
  }
  return {rows:q.rows,count};
}
const api={FORMAT,LIMIT,clone,round,uid,fresh,normalize,parseLyrics,lyricsText,reconcile,validate,shift,fmt,subtitles,csv,filename,parseTime,plainCaption,importSubtitles,lrc,alignEnds};
if(typeof module!=='undefined' && module.exports)module.exports=api;
root.LyricSyncCore=api;
})(globalThis);
