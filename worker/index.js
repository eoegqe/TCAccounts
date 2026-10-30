import { connect } from "cloudflare:sockets";
import { TC_NOTIFICATION_TEMPLATES } from "./notification-templates.js";
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff",...headers}});
const enc=new TextEncoder(), COOKIE="tc_session", AGE=2592000;
const b64=b=>{let s="";for(const x of b)s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")};
const random=(n=32)=>{const b=new Uint8Array(n);crypto.getRandomValues(b);return b64(b)};
const hash=async s=>b64(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(s))));
async function passwordHash(p,s=random(16)){const rounds=100000;const k=await crypto.subtle.importKey("raw",enc.encode(p),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:enc.encode(s),iterations:rounds},k,256);return "pbkdf2_sha256$"+rounds+"$"+s+"$"+b64(new Uint8Array(bits));}
async function verify(p,stored){try{const parts=stored.split("$");if(parts.length===4&&parts[0]==="pbkdf2_sha256"&&parts[1]==="100000")return(await passwordHash(p,parts[2]))===stored;const prefix="pbkdf2_sha256100000",salt=stored.startsWith(prefix)?stored.slice(prefix.length,prefix.length+22):"";return !!salt&&stored===prefix+salt+(await passwordHash(p,salt)).split("$")[3]}catch{return false}}
const cookie=(v,age)=>`${COOKIE}=${v}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
function getCookie(req){for(const p of (req.headers.get("cookie")||"").split(";")){const i=p.indexOf("=");if(i>=0&&p.slice(0,i).trim()===COOKIE)return p.slice(i+1).trim()}return ""}
const corsJson=(req,data,status=200,headers={})=>{const origin=req.headers.get("origin");return json(data,status,{...(origin?{"access-control-allow-origin":origin,"access-control-allow-headers":"authorization, content-type","access-control-allow-methods":"GET, POST, OPTIONS","vary":"Origin"}:{}),...headers})};
async function body(req){try{return await req.json()}catch{return null}}
async function session(req,env){const t=getCookie(req);if(!t)return null;const h=await hash(t),now=new Date().toISOString();const u=await env.TC.prepare("SELECT s.id_hash,s.user_id,u.username,u.email,u.status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id_hash=? AND s.expires_at>? AND u.status='active'").bind(h,now).first();if(u)await env.TC.prepare("UPDATE sessions SET last_seen_at=? WHERE id_hash=?").bind(now,h).run();return u}
async function createSession(env,userId){const token=random(),now=new Date().toISOString(),expires=new Date(Date.now()+AGE*1000).toISOString();await env.TC.prepare("INSERT INTO sessions(id_hash,user_id,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)").bind(await hash(token),userId,expires,now,now).run();return token}

const base64Text=value=>{const bytes=enc.encode(value);let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary)};
async function sendResetEmail(env,to,token,requestUrl){
if(!env.IONOS_SMTP_USER||!env.IONOS_SMTP_PASSWORD)throw new Error("IONOS SMTP secrets are missing");
const host=env.IONOS_SMTP_HOST||"smtp.ionos.com",from=env.IONOS_SMTP_FROM||"notify@theegget.com",port=Number(env.IONOS_SMTP_PORT||465);
const resetUrl=new URL("/",requestUrl);resetUrl.searchParams.set("reset_token",token);
const plain="A password reset was requested for your TC Accounts identity.\r\n\r\nUse this one-time link within 30 minutes to choose a new password:\r\n"+resetUrl.toString()+"\r\n\r\nIf you did not request this, you can ignore this email.";
const html="<div style=\"background:#080808;color:#f5f5f5;font-family:Arial,sans-serif;padding:32px\"><div style=\"max-width:520px;margin:auto;border:1px solid #292929;border-radius:16px;padding:28px;background:#111\"><p style=\"color:#aaa;font-size:12px\">THEEGGET CREATIONS · TC ACCOUNTS</p><h1 style=\"font-size:25px\">Reset your password</h1><p style=\"color:#bbb;line-height:1.6\">A password reset was requested for your TC Accounts identity. Use the link below within 30 minutes to choose a new password.</p><p><a href=\""+resetUrl.toString()+"\" style=\"display:inline-block;background:#fff;color:#111;padding:13px 18px;border-radius:8px;text-decoration:none;font-weight:bold\">Reset password</a></p><p style=\"color:#888;font-size:12px;line-height:1.6\">If you did not request this, you can ignore this email. The link can only be used once.</p><p style=\"color:#666;font-size:11px\">Theegget Creations</p></div></div>";
const socket=connect({hostname:host,port},{secureTransport:"on",allowHalfOpen:false});
const writer=socket.writable.getWriter(),reader=socket.readable.getReader(),decoder=new TextDecoder();
let pending="",lines=[];
const readReply=async()=>{const reply=[];while(true){const end=lines.findIndex(line=>/^\d{3} /.test(line));if(end>=0){reply.push(...lines.splice(0,end+1));return reply.join("\n")}const part=await reader.read();if(part.done)throw new Error("SMTP connection closed unexpectedly");pending+=decoder.decode(part.value,{stream:true});const split=pending.split("\r\n");pending=split.pop();lines.push(...split)}};
const command=async(line,expected)=>{await writer.write(enc.encode(line+"\r\n"));const result=await readReply();if(!expected.includes(Number(result.slice(0,3))))throw new Error("SMTP command failed with response "+result.slice(0,3));return result};
try{
const greeting=await readReply();if(!greeting.startsWith("220"))throw new Error("SMTP greeting failed");
await command("EHLO accounts.theegget.com",[250]);
await command("AUTH LOGIN",[334]);
await command(base64Text(env.IONOS_SMTP_USER),[334]);
await command(base64Text(env.IONOS_SMTP_PASSWORD),[235]);
await command("MAIL FROM:<"+from+">",[250]);
await command("RCPT TO:<"+to+">",[250,251]);
await command("DATA",[354]);
const mime=["From: Theegget Creations <"+from+">","To: <"+to+">","Subject: Reset your TC Accounts password","MIME-Version: 1.0","Content-Type: multipart/alternative; boundary=\"tcaccounts-reset\"","","--tcaccounts-reset","Content-Type: text/plain; charset=UTF-8","Content-Transfer-Encoding: base64","",base64Text(plain),"--tcaccounts-reset","Content-Type: text/html; charset=UTF-8","Content-Transfer-Encoding: base64","",base64Text(html),"--tcaccounts-reset--",""].join("\r\n");
await writer.write(enc.encode(mime+"\r\n.\r\n"));
const accepted=await readReply();if(!accepted.startsWith("250"))throw new Error("SMTP message was not accepted");
await command("QUIT",[221]);
}finally{try{await writer.close()}catch{}try{await reader.cancel()}catch{}try{socket.close()}catch{}}
};

async function sendEventNotification(env,user,subject,message){
if(!env.IONOS_SMTP_USER||!env.IONOS_SMTP_PASSWORD)throw new Error("IONOS SMTP secrets are missing");
const host=env.IONOS_SMTP_HOST||"smtp.ionos.com",from=env.IONOS_SMTP_FROM||"notify@theegget.com",port=Number(env.IONOS_SMTP_PORT||465);
const safe=value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const html=safe(message).replace(/\r\n|\r|\n/g,"<br>");
const b64=value=>{const raw=base64Text(value);return raw.replace(/.{1,76}/g,line=>line+"\r\n").trim()};
const socket=connect({hostname:host,port},{secureTransport:"on",allowHalfOpen:false});
const writer=socket.writable.getWriter(),reader=socket.readable.getReader(),decoder=new TextDecoder();
let pending="",lines=[];
const readReply=async()=>{while(true){const end=lines.findIndex(line=>/^\d{3} /.test(line));if(end>=0)return lines.splice(0,end+1).join("\n");const part=await reader.read();if(part.done)throw new Error("SMTP connection closed unexpectedly");pending+=decoder.decode(part.value,{stream:true});const split=pending.split("\r\n");pending=split.pop();lines.push(...split)}};
const command=async(line,expected)=>{await writer.write(enc.encode(line+"\r\n"));const result=await readReply();if(!expected.includes(Number(result.slice(0,3))))throw new Error("SMTP command failed with response "+result.slice(0,3));return result};
try{
const greeting=await readReply();if(!greeting.startsWith("220"))throw new Error("SMTP greeting failed");
await command("EHLO accounts.theegget.com",[250]);await command("AUTH LOGIN",[334]);await command(base64Text(env.IONOS_SMTP_USER),[334]);await command(base64Text(env.IONOS_SMTP_PASSWORD),[235]);
await command("MAIL FROM:<"+from+">",[250]);await command("RCPT TO:<"+String(user.email).replace(/[\r\n<>]/g,"")+">",[250,251]);await command("DATA",[354]);
const boundary="tc-event-"+crypto.randomUUID(),encodedSubject="=?UTF-8?B?"+btoa(unescape(encodeURIComponent(subject)))+"?=";
const mime=["From: Theegget Creations <"+from+">","To: <"+String(user.email).replace(/[\r\n<>]/g,"")+">","Subject: "+encodedSubject,"MIME-Version: 1.0",'Content-Type: multipart/alternative; boundary="'+boundary+'"',"","--"+boundary,"Content-Type: text/plain; charset=UTF-8","Content-Transfer-Encoding: base64","",b64(message),"--"+boundary,"Content-Type: text/html; charset=UTF-8","Content-Transfer-Encoding: base64","",b64('<div style="font-family:Arial,sans-serif;line-height:1.6;color:#202124">'+html+'</div>'),"--"+boundary+"--",""].join("\r\n");
await writer.write(enc.encode(mime+"\r\n.\r\n"));const accepted=await readReply();if(!accepted.startsWith("250"))throw new Error("SMTP message was not accepted");try{await command("QUIT",[221])}catch{}
}finally{try{await writer.close()}catch{}try{await reader.cancel()}catch{}try{socket.close()}catch{}}
}

async function sendPasswordChangedEmail(env,user){
if(!env.IONOS_SMTP_USER||!env.IONOS_SMTP_PASSWORD)throw new Error("IONOS SMTP secrets are missing");
const host=env.IONOS_SMTP_HOST||"smtp.ionos.com",from=env.IONOS_SMTP_FROM||"notify@theegget.com",port=Number(env.IONOS_SMTP_PORT||465);
const plain="hello "+user.username+"\r\n\r\nYour password has been changed.\r\n\r\nIf this was not you, secure your account now: https://accounts.theegget.com\r\nIf you have lost access to your account, contact support (support@theegget.com).\r\n\r\nBest, TC";
const safeName=String(user.username).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const html="<div style=\"font-family:Arial,sans-serif;line-height:1.6;color:#202124\"><p>hello "+safeName+"</p><p>Your password has been changed.</p><p>If this was not you, <a href=\"https://accounts.theegget.com\">secure your account now</a>.</p><p>If you have lost access to your account, contact support (<a href=\"mailto:support@theegget.com\">support@theegget.com</a>).</p><p>Best, TC</p></div>";
const socket=connect({hostname:host,port},{secureTransport:"on",allowHalfOpen:false});
const writer=socket.writable.getWriter(),reader=socket.readable.getReader(),decoder=new TextDecoder();
let pending="",lines=[];
const readReply=async()=>{const reply=[];while(true){const end=lines.findIndex(line=>/^\d{3} /.test(line));if(end>=0){reply.push(...lines.splice(0,end+1));return reply.join("\n")}const part=await reader.read();if(part.done)throw new Error("SMTP connection closed unexpectedly");pending+=decoder.decode(part.value,{stream:true});const split=pending.split("\r\n");pending=split.pop();lines.push(...split)}};
const command=async(line,expected)=>{await writer.write(enc.encode(line+"\r\n"));const result=await readReply();if(!expected.includes(Number(result.slice(0,3))))throw new Error("SMTP command failed with response "+result.slice(0,3));return result};
try{
const greeting=await readReply();if(!greeting.startsWith("220"))throw new Error("SMTP greeting failed");
await command("EHLO accounts.theegget.com",[250]);
await command("AUTH LOGIN",[334]);
await command(base64Text(env.IONOS_SMTP_USER),[334]);
await command(base64Text(env.IONOS_SMTP_PASSWORD),[235]);
await command("MAIL FROM:<"+from+">",[250]);
await command("RCPT TO:<"+user.email+">",[250,251]);
await command("DATA",[354]);
const boundary="tc-security-notice";
const mime=["From: Theegget Creations <"+from+">","To: <"+user.email+">","Subject: TC Security Notification","MIME-Version: 1.0","Content-Type: multipart/alternative; boundary=\""+boundary+"\"","","--"+boundary,"Content-Type: text/plain; charset=UTF-8","Content-Transfer-Encoding: base64","",base64Text(plain),"--"+boundary,"Content-Type: text/html; charset=UTF-8","Content-Transfer-Encoding: base64","",base64Text(html),"--"+boundary+"--",""].join("\r\n");
await writer.write(enc.encode(mime+"\r\n.\r\n"));
const accepted=await readReply();if(!accepted.startsWith("250"))throw new Error("SMTP message was not accepted");
await command("QUIT",[221]);
}finally{try{await writer.close()}catch{}try{await reader.cancel()}catch{}try{socket.close()}catch{}}
}



function mailboxAddress(value){
  const email=String(value||"").trim().toLowerCase();
  return /^[a-z0-9.!#$%&'*+/=?^_\x60{|}~-]+@theegget\.com$/i.test(email)?email:"";
}
async function authorizeSupportMailbox(request,env){
  const origin=request.headers.get("origin")||"";
  if(origin!=="https://admin.theegget.com")return {error:json({error:"origin_not_allowed"},403)};
  const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return {error:json({error:"not_authenticated"},401,{"access-control-allow-origin":origin,"vary":"Origin"})};
  try{
    const response=await fetch("https://accounts.theegget.com/oauth/userinfo",{headers:{Authorization:"Bearer "+token,Accept:"application/json"},cf:{cacheTtl:0}});
    if(!response.ok)return {error:json({error:"not_authenticated"},401,{"access-control-allow-origin":origin,"vary":"Origin"})};
    const identity=await response.json(),id=Number(identity.sub);
    if(!Number.isSafeInteger(id)||id<1)return {error:json({error:"invalid_identity"},401,{"access-control-allow-origin":origin,"vary":"Origin"})};
    const account=await env.TC.prepare("SELECT id,role,status FROM users WHERE id=?").bind(id).first();
    if(!account||account.status!=="active"||Number(account.role)<2)return {error:json({error:"staff_only",message:"Support role or higher is required."},403,{"access-control-allow-origin":origin,"vary":"Origin"})};
    return {account,origin};
  }catch{return {error:json({error:"authorization_unavailable"},503,{"access-control-allow-origin":origin,"vary":"Origin"})}}
}
function supportJson(origin,data,status=200){
  return json(data,status,{"access-control-allow-origin":origin,"access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"authorization, content-type","vary":"Origin"});
}
function decodeHeader(value){
  return String(value||"").replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi,(_,charset,encoding,encoded)=>{
    try{
      if(encoding.toLowerCase()==="b"){
        const binary=atob(encoded);
        const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
        return new TextDecoder(charset,{fatal:false}).decode(bytes);
      }
      return encoded.replace(/_/g," ").replace(/=([0-9a-f]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
    }catch{return encoded}
  });
}
function parseHeaders(raw){
  const unfolded=String(raw||"").replace(/\r\n[ \t]+/g," ");
  const result={};
  for(const line of unfolded.split(/\r\n/)){
    const index=line.indexOf(":");
    if(index>0){const key=line.slice(0,index).trim().toLowerCase();result[key]=result[key]?result[key]+", "+line.slice(index+1).trim():line.slice(index+1).trim()}
  }
  return result;
}
function decodeQuotedPrintable(value){
  return String(value||"").replace(/=\r\n/g,"").replace(/=([0-9a-f]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
}
function decodePartBody(value,encoding){
  if(/^base64$/i.test(encoding||"")){
    try{const clean=String(value||"").replace(/\s/g,"");const binary=atob(clean);return new TextDecoder().decode(Uint8Array.from(binary,c=>c.charCodeAt(0)))}catch{return ""}
  }
  if(/^quoted-printable$/i.test(encoding||""))return decodeQuotedPrintable(value);
  return String(value||"");
}
function parseMail(raw){
  const separator=raw.indexOf("\r\n\r\n");
  const headers=parseHeaders(separator>=0?raw.slice(0,separator):raw);
  const content=separator>=0?raw.slice(separator+4):"";
  const subject=decodeHeader(headers.subject||"(no subject)");
  const from=decodeHeader(headers.from||"");
  const to=decodeHeader(headers.to||"");
  const messageId=headers["message-id"]||"";
  const contentType=headers["content-type"]||"text/plain";
  let text="",html="",attachments=[];
  const collect=(partRaw)=>{
    const split=partRaw.indexOf("\r\n\r\n");
    if(split<0)return;
    const h=parseHeaders(partRaw.slice(0,split)),body=partRaw.slice(split+4);
    const type=(h["content-type"]||"text/plain").toLowerCase();
    const transfer=h["content-transfer-encoding"]||"";
    const disposition=h["content-disposition"]||"";
    const filenameMatch=type.match(/name="?([^";]+)"?/i)||disposition.match(/filename="?([^";]+)"?/i);
    const boundaryMatch=type.match(/boundary="?([^";]+)"?/i);
    if(type.startsWith("multipart/")&&boundaryMatch){
      const boundary="--"+boundaryMatch[1];
      for(const part of body.split(boundary).slice(1)){
        if(part.startsWith("--"))continue;
        collect(part.replace(/^\r\n/,"").replace(/\r\n$/,""));
      }
      return;
    }
    if(filenameMatch||/attachment/i.test(disposition)){
      const filename=decodeHeader(filenameMatch?.[1]||"attachment");
      const binary=body.replace(/\r\n$/,"");
      attachments.push({filename,content_type:(h["content-type"]||"application/octet-stream").split(";")[0],size:/^base64$/i.test(transfer)?Math.floor(binary.replace(/\s/g,"").length*3/4):binary.length,content_base64:/^base64$/i.test(transfer)?binary.replace(/\s/g,""):btoa(binary)});
      return;
    }
    if(type.startsWith("text/plain"))text+=decodePartBody(body,transfer);
    else if(type.startsWith("text/html"))html+=decodePartBody(body,transfer);
  };
  collect("Content-Type: "+contentType+"\r\n"+(headers["content-transfer-encoding"]?"Content-Transfer-Encoding: "+headers["content-transfer-encoding"]+"\r\n":"")+"\r\n"+content);
  const cleanText=text.replace(/\r\n/g,"\n").replace(/\0/g,"").slice(0,100000);
  const plain=cleanText||html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi,"").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/\s+/g," ").slice(0,100000);
  return {subject,from,to,date:headers.date||"",message_id:messageId,in_reply_to:headers["in-reply-to"]||"",body:plain,attachments};
}
async function openImap(email,password,env){
  const socket=connect({hostname:env.IONOS_IMAP_HOST||"imap.ionos.com",port:Number(env.IONOS_IMAP_PORT||993)},{secureTransport:"on",allowHalfOpen:false});
  const reader=socket.readable.getReader(),writer=socket.writable.getWriter(),decoder=new TextDecoder();
  let buffer=new Uint8Array(0),tagNumber=0;
  const append=part=>{const next=new Uint8Array(buffer.length+part.length);next.set(buffer);next.set(part,buffer.length);buffer=next};
  const readChunk=async()=>{const part=await reader.read();if(part.done)throw new Error("IMAP connection closed");append(part.value)};
  const readLine=async()=>{
    while(true){
      for(let i=0;i<buffer.length-1;i++)if(buffer[i]===13&&buffer[i+1]===10){
        const line=decoder.decode(buffer.slice(0,i));buffer=buffer.slice(i+2);return line;
      }
      await readChunk();
    }
  };
  const readBytes=async count=>{
    while(buffer.length<count)await readChunk();
    const result=buffer.slice(0,count);buffer=buffer.slice(count);return result;
  };
  const command=async value=>{
    const tag="A"+String(++tagNumber).padStart(3,"0");
    await writer.write(enc.encode(tag+" "+value+"\r\n"));
    const items=[];
    while(true){
      const line=await readLine();items.push({line});
      const literal=line.match(/\{(\d+)\+?\}$/);
      if(literal){const length=Number(literal[1]);if(!Number.isSafeInteger(length)||length>8*1024*1024)throw new Error("Message exceeds the 8 MB mailbox limit.");const bytes=await readBytes(length);items.push({literal:decoder.decode(bytes)});}
      if(line.startsWith(tag+" "))return {tag,line,items,ok:new RegExp("^"+tag+" OK(?:\\s|$)","i").test(line)};
    }
  };
  try{
    const greeting=await readLine();
    if(!greeting.startsWith("* OK"))throw new Error("IMAP service unavailable");
    const login=await command("LOGIN "+JSON.stringify(email)+" "+JSON.stringify(password));
    if(!login.ok)throw new Error("The TC mailbox address or password is incorrect.");
    return {
      command,
      close:async()=>{try{await command("LOGOUT")}catch{}try{await writer.close()}catch{}try{await reader.cancel()}catch{}try{socket.close()}catch{}}
    };
  }catch(e){try{await writer.close()}catch{}try{await reader.cancel()}catch{}try{socket.close()}catch{}throw e}
}
async function mailboxInbox(email,password,env){
  const imap=await openImap(email,password,env);
  try{
    const selected=await imap.command("SELECT INBOX");
    if(!selected.ok)throw new Error("Could not open the INBOX folder.");
    const search=await imap.command("UID SEARCH ALL");
    const searchLine=search.items.find(item=>item.line?.startsWith("* SEARCH"));
    const uids=(searchLine?.line||"").replace("* SEARCH","").trim().split(/\s+/).filter(Boolean).map(Number).filter(Number.isSafeInteger);
    const latest=uids.slice(-50).reverse();
    if(!latest.length)return {messages:[],total:0};
    const fetched=await imap.command("UID FETCH "+latest.join(",")+" (UID FLAGS INTERNALDATE RFC822.SIZE BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID)])");
    const messages=[];
    for(let i=0;i<fetched.items.length;i++){
      const item=fetched.items[i];
      if(!item.line?.includes("FETCH"))continue;
      const header=fetched.items[i+1]?.literal;
      if(typeof header!=="string")continue;
      const h=parseHeaders(header);
      const uid=Number((item.line.match(/\bUID\s+(\d+)/i)||[])[1]);
      if(!uid)continue;
      messages.push({uid,from:decodeHeader(h.from||""),to:decodeHeader(h.to||""),subject:decodeHeader(h.subject||"(no subject)"),date:h.date||"",message_id:h["message-id"]||"",unread:!/\bFLAGS\s+\([^)]*\\Seen/i.test(item.line)});
    }
    messages.sort((a,b)=>b.uid-a.uid);\n    return {messages,total:uids.length};
  }finally{await imap.close()}
}
async function mailboxMessage(email,password,uid,env){
  const imap=await openImap(email,password,env);
  try{
    const selected=await imap.command("SELECT INBOX");if(!selected.ok)throw new Error("Could not open the INBOX folder.");
    const fetched=await imap.command("UID FETCH "+uid+" (UID BODY[])");
    const literal=fetched.items.find(item=>typeof item.literal==="string")?.literal;
    if(!fetched.ok||!literal)throw new Error("That support message could not be loaded.");
    return {uid,...parseMail(literal)};
  }finally{await imap.close()}
}
async function sendMailboxReply(email,password,recipient,subject,body,original,env){
  if(!env.IONOS_SMTP_HOST&&!env.IONOS_SMTP_PORT){} 
  const host=env.IONOS_SMTP_HOST||"smtp.ionos.com",port=Number(env.IONOS_SMTP_PORT||465);
  const socket=connect({hostname:host,port},{secureTransport:"on",allowHalfOpen:false});
  const writer=socket.writable.getWriter(),reader=socket.readable.getReader(),decoder=new TextDecoder();
  let pending="",lines=[];
  const readReply=async()=>{
    while(true){
      const end=lines.findIndex(line=>/^\d{3} /.test(line));
      if(end>=0)return lines.splice(0,end+1).join("\n");
      const part=await reader.read();if(part.done)throw new Error("SMTP connection closed");
      pending+=decoder.decode(part.value,{stream:true});const split=pending.split("\r\n");pending=split.pop();lines.push(...split);
    }
  };
  const command=async(line,expected)=>{
    await writer.write(enc.encode(line+"\r\n"));const response=await readReply();
    if(!expected.includes(Number(response.slice(0,3))))throw new Error("SMTP rejected the reply (code "+response.slice(0,3)+").");
    return response;
  };
  const safeAddress=value=>String(value||"").replace(/[\r\n<>]/g,"");
  try{
    const greeting=await readReply();if(!greeting.startsWith("220"))throw new Error("SMTP service unavailable");
    await command("EHLO admin.theegget.com",[250]);
    await command("AUTH LOGIN",[334]);
    const b64=value=>btoa(unescape(encodeURIComponent(value)));
    await command(b64(email),[334]);await command(b64(password),[235]);
    await command("MAIL FROM:<"+email+">",[250]);
    await command("RCPT TO:<"+safeAddress(recipient)+">",[250,251]);
    await command("DATA",[354]);
    const encodedSubject="=?UTF-8?B?"+btoa(unescape(encodeURIComponent(subject)))+"?=";
    const plain=String(body).replace(/\r\n/g,"\n").replace(/\r/g,"\n").replace(/\0/g,"");
    const refs=[original.message_id,original.in_reply_to].filter(Boolean).join(" ");
    const linesOut=["From: <"+email+">","To: <"+safeAddress(recipient)+">","Subject: "+encodedSubject,"In-Reply-To: "+String(original.message_id||"").replace(/[\r\n]/g,""),"References: "+refs.replace(/[\r\n]/g,""),"MIME-Version: 1.0","Content-Type: text/plain; charset=UTF-8","Content-Transfer-Encoding: base64","",btoa(unescape(encodeURIComponent(plain))).replace(/.{1,76}/g,"$&\r\n"),""].join("\r\n");
    await writer.write(enc.encode(linesOut.replace(/^\./gm,"..")+"\r\n.\r\n"));
    const accepted=await readReply();if(!accepted.startsWith("250"))throw new Error("SMTP did not accept the reply.");
    try{await command("QUIT",[221])}catch{}
  }finally{try{await writer.close()}catch{}try{await reader.cancel()}catch{}try{socket.close()}catch{}}
}


export default {async fetch(request,env){const url=new URL(request.url);if(request.method==="OPTIONS"){const origin=request.headers.get("origin")||"*";return new Response(null,{status:204,headers:{"access-control-allow-origin":origin,"access-control-allow-methods":"GET, POST, OPTIONS","access-control-allow-headers":"authorization, content-type","access-control-max-age":"86400","vary":"Origin"}});}
if(url.pathname==="/api/health"&&request.method==="GET"){try{const r=await env.TC.prepare("SELECT 1 AS ok").first();return json({service:"TCAccounts API",status:r?.ok===1?"ok":"database_unavailable",environment:env.APP_ENV||"unknown"},r?.ok===1?200:503)}catch{return json({status:"database_unavailable"},503)}}
if(url.pathname==="/api/register"&&request.method==="POST"){
const b=await body(request),username=typeof b?.username==="string"?b.username.trim():"",email=typeof b?.email==="string"?b.email.trim().toLowerCase():"",password=typeof b?.password==="string"?b.password:"";
if(username.length<3||username.length>32||!/^[a-zA-Z0-9_.-]+$/.test(username))return json({error:"invalid_username",message:"Use 3–32 letters, numbers, dots, underscores, or hyphens."},400);
if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({error:"invalid_email",message:"Enter a valid email address."},400);
if(password.length<12||password.length>128)return json({error:"invalid_password",message:"Password must be at least 12 characters."},400);
try{
const now=new Date().toISOString(),existing=await env.TC.prepare("SELECT id FROM users WHERE username=? COLLATE NOCASE OR email=? COLLATE NOCASE LIMIT 1").bind(username,email).first();
if(existing)return json({error:"account_exists",message:"That username or email is already in use."},409);
const pending=await env.TC.prepare("SELECT challenge_hash FROM pending_account_registrations WHERE username=? COLLATE NOCASE OR email=? COLLATE NOCASE LIMIT 1").bind(username,email).first();
if(pending)await env.TC.prepare("DELETE FROM pending_account_registrations WHERE challenge_hash=?").bind(pending.challenge_hash).run();
const challenge=random(32),code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,"0"),challengeHash=await hash(challenge),expires=new Date(Date.now()+10*60*1000).toISOString();
await env.TC.prepare("INSERT INTO pending_account_registrations(challenge_hash,username,email,password_hash,code_hash,attempts,expires_at,created_at) VALUES(?,?,?,?,?,0,?,?)").bind(challengeHash,username,email,await passwordHash(password),await hash(challenge+":"+code),expires,now).run();
try{await sendEventNotification(env,{email,username},"Verify your email for TC Accounts","Hello, "+username+"\r\n\r\nYour TC Accounts email verification code is: "+code+"\r\n\r\nEnter this six-digit code to finish creating your account. It expires in 10 minutes. If you did not request an account, you can ignore this email.\r\n\r\nBest, TC")}catch(e){await env.TC.prepare("DELETE FROM pending_account_registrations WHERE challenge_hash=?").bind(challengeHash).run();throw e}
return json({requires_email_verification:true,challenge_id:challenge,message:"A six-digit verification code has been sent to your email address."},202);
}catch(e){const detail=String(e?.message||e||"unknown_error");console.error("TC Accounts registration verification failed:",detail);if(/unique|constraint failed/i.test(detail))return json({error:"account_exists",message:"That username or email is already in use."},409);return json({error:"registration_failed",message:"The verification email could not be sent or the registration could not be started. Please try again."},503)}
}
if(url.pathname==="/api/register/verify"&&request.method==="POST"){
const b=await body(request),challenge=typeof b?.challenge_id==="string"?b.challenge_id:"",code=typeof b?.code==="string"?b.code.trim():"";
if(!challenge||challenge.length>128||!/^[0-9]{6}$/.test(code))return json({error:"invalid_verification_code",message:"Enter the six-digit code from your email."},400);
try{
const challengeHash=await hash(challenge),now=new Date().toISOString(),row=await env.TC.prepare("SELECT * FROM pending_account_registrations WHERE challenge_hash=?").bind(challengeHash).first();
if(!row||row.expires_at<=now){if(row)await env.TC.prepare("DELETE FROM pending_account_registrations WHERE challenge_hash=?").bind(challengeHash).run();return json({error:"verification_expired",message:"That code has expired. Start creating your account again."},400)}
if(Number(row.attempts)>=5){await env.TC.prepare("DELETE FROM pending_account_registrations WHERE challenge_hash=?").bind(challengeHash).run();return json({error:"too_many_attempts",message:"Too many incorrect codes. Start registration again."},429)}
if(await hash(challenge+":"+code)!==row.code_hash){const attempts=Number(row.attempts)+1;if(attempts>=5)await env.TC.prepare("DELETE FROM pending_account_registrations WHERE challenge_hash=?").bind(challengeHash).run();else await env.TC.prepare("UPDATE pending_account_registrations SET attempts=? WHERE challenge_hash=?").bind(attempts,challengeHash).run();return json({error:"invalid_verification_code",message:attempts>=5?"Too many incorrect codes. Start registration again.":"That code is incorrect. Check the email and try again."},401)}
const existing=await env.TC.prepare("SELECT id FROM users WHERE username=? COLLATE NOCASE OR email=? COLLATE NOCASE LIMIT 1").bind(row.username,row.email).first();
if(existing){await env.TC.prepare("DELETE FROM pending_account_registrations WHERE challenge_hash=?").bind(challengeHash).run();return json({error:"account_exists",message:"That username or email is already in use."},409)}
const user=await env.TC.prepare("INSERT INTO users(id,username,email,password_hash,status,created_at,updated_at) VALUES((SELECT COALESCE(MAX(id),0)+1 FROM users),?,?,?,?,?,?) RETURNING id,username,email,status,created_at").bind(row.username,row.email,row.password_hash,"active",now,now).first();
await env.TC.prepare("DELETE FROM pending_account_registrations WHERE challenge_hash=?").bind(challengeHash).run();
const token=await createSession(env,user.id);
try{const template=TC_NOTIFICATION_TEMPLATES.accountCreated;await sendEventNotification(env,user,template.subject,template.render({username:user.username}))}catch(e){console.error("TC account-created notification failed:",String(e?.message||e))}
return json({user},201,{"set-cookie":cookie(token,AGE)});
}catch(e){console.error("TC registration email verification failed:",String(e?.message||e));return json({error:"verification_unavailable",message:"Email verification is temporarily unavailable. Please try again."},503)}
}

if(url.pathname==="/api/password-reset/request"&&request.method==="POST"){
const b=await body(request),email=typeof b?.email==="string"?b.email.trim().toLowerCase():"";
if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({error:"invalid_email",message:"Enter the email address on your TC account."},400);
try{
const u=await env.TC.prepare("SELECT id,email FROM users WHERE email=? COLLATE NOCASE AND status='active' LIMIT 1").bind(email).first();
if(u){
const now=new Date().toISOString(),token=random(32),expires=new Date(Date.now()+30*60*1000).toISOString(),tokenHash=await hash(token);
await env.TC.prepare("DELETE FROM password_reset_tokens WHERE user_id=?").bind(u.id).run();
await env.TC.prepare("INSERT INTO password_reset_tokens(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)").bind(tokenHash,u.id,expires,now).run();
try{await sendResetEmail(env,u.email,token,url.origin)}catch(e){await env.TC.prepare("DELETE FROM password_reset_tokens WHERE token_hash=?").bind(tokenHash).run();console.error("TC Accounts reset email delivery failed:",String(e?.message||e));}
}
return json({success:true,message:"If an active TC account uses that email address, a password reset link will be sent shortly."});
}catch(e){console.error("TC Accounts password reset request failed:",String(e?.message||e));return json({error:"password_reset_unavailable",message:"Password recovery is temporarily unavailable. Please try again later."},503)}
}
if(url.pathname==="/api/password-reset/confirm"&&request.method==="POST"){
const b=await body(request),token=typeof b?.token==="string"?b.token:"",password=typeof b?.password==="string"?b.password:"";
if(!token||token.length>128)return json({error:"invalid_reset_token",message:"This password reset link is invalid or expired."},400);
if(password.length<12||password.length>128)return json({error:"invalid_password",message:"Password must be at least 12 characters."},400);
try{
const tokenHash=await hash(token),now=new Date().toISOString();
const row=await env.TC.prepare("SELECT t.user_id,u.username,u.email FROM password_reset_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.expires_at>? AND u.status='active' LIMIT 1").bind(tokenHash,now).first();
if(!row)return json({error:"invalid_reset_token",message:"This password reset link is invalid or expired."},400);
const updated=await env.TC.prepare("UPDATE users SET password_hash=?,updated_at=? WHERE id=? AND status='active'").bind(await passwordHash(password),now,row.user_id).run();
if(!updated.meta?.changes)return json({error:"password_reset_failed",message:"The password could not be changed. Request a new reset link."},400);
await env.TC.prepare("DELETE FROM password_reset_tokens WHERE user_id=?").bind(row.user_id).run();
await env.TC.prepare("DELETE FROM sessions WHERE user_id=?").bind(row.user_id).run();
try{await sendPasswordChangedEmail(env,{username:row.username,email:row.email})}catch(e){console.error("TC Accounts password-change notification failed:",String(e?.message||e))}
return json({success:true,message:"Your password has been reset. Sign in with your new password."});
}catch(e){console.error("TC Accounts password reset confirmation failed:",String(e?.message||e));return json({error:"password_reset_unavailable",message:"Password recovery is temporarily unavailable. Please try again later."},503)}
}
if(url.pathname==="/api/password/change"&&request.method==="POST"){
const u=await session(request,env);if(!u)return json({error:"not_authenticated",message:"Sign in again before changing your password."},401);
const b=await body(request),currentPassword=typeof b?.currentPassword==="string"?b.currentPassword:"",newPassword=typeof b?.newPassword==="string"?b.newPassword:"";
if(!currentPassword||!newPassword)return json({error:"missing_password",message:"Enter your current password and a new password."},400);
if(newPassword.length<12||newPassword.length>128)return json({error:"invalid_password",message:"Your new password must be at least 12 characters."},400);
if(currentPassword===newPassword)return json({error:"same_password",message:"Choose a password different from your current password."},400);
try{
const account=await env.TC.prepare("SELECT id,username,email,password_hash FROM users WHERE id=? AND status='active'").bind(u.user_id).first();
if(!account||!(await verify(currentPassword,account.password_hash)))return json({error:"incorrect_password",message:"Your current password is incorrect."},401);
const now=new Date().toISOString();
const updated=await env.TC.prepare("UPDATE users SET password_hash=?,updated_at=? WHERE id=? AND status='active'").bind(await passwordHash(newPassword),now,u.user_id).run();
if(!updated.meta?.changes)return json({error:"password_change_failed",message:"Your password could not be changed. Please try again."},400);
await env.TC.prepare("DELETE FROM sessions WHERE user_id=? AND id_hash<>?").bind(u.user_id,u.id_hash).run();
try{await sendPasswordChangedEmail(env,{username:account.username,email:account.email})}catch(e){console.error("TC Accounts password-change notification failed:",String(e?.message||e))}
return json({success:true,message:"Your password has been changed. Other signed-in sessions have been signed out."});
}catch(e){console.error("TC Accounts authenticated password change failed:",String(e?.message||e));return json({error:"password_change_unavailable",message:"Password change is temporarily unavailable. Please try again later."},503)}
}
if(url.pathname==="/api/login"&&request.method==="POST"){const b=await body(request),id=typeof b?.identifier==="string"?b.identifier.trim():"",p=typeof b?.password==="string"?b.password:"";if(!id||!p)return json({error:"missing_credentials",message:"Enter your username/email and password."},400);try{const u=await env.TC.prepare("SELECT id,username,email,password_hash,status,email_2fa_enabled FROM users WHERE username=? COLLATE NOCASE OR email=? COLLATE NOCASE LIMIT 1").bind(id,id).first();if(!u||u.status!=="active"||!(await verify(p,u.password_hash)))return json({error:"invalid_credentials",message:"The username/email or password is incorrect."},401);if(Number(u.email_2fa_enabled)===1){const challenge=random(32),code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,"0"),now=new Date().toISOString(),expires=new Date(Date.now()+10*60*1000).toISOString(),challengeHash=await hash(challenge);await env.TC.prepare("DELETE FROM email_2fa_challenges WHERE user_id=?").bind(u.id).run();await env.TC.prepare("INSERT INTO email_2fa_challenges(challenge_hash,user_id,code_hash,attempts,expires_at,created_at) VALUES(?,?,?,0,?,?)").bind(challengeHash,u.id,await hash(challenge+":"+code),expires,now).run();try{await sendEventNotification(env,{email:u.email,username:u.username},"Your TC sign-in verification code","Hello, "+u.username+"\r\n\r\nYour TC Accounts verification code is: "+code+"\r\n\r\nThis code expires in 10 minutes and can only be used once. If you did not attempt to sign in, you can ignore this email.\r\n\r\nBest, TC")}catch(e){await env.TC.prepare("DELETE FROM email_2fa_challenges WHERE challenge_hash=?").bind(challengeHash).run();console.error("TC email 2FA delivery failed:",String(e?.message||e));return json({error:"verification_email_failed",message:"The verification email could not be sent. Please try again later."},503)}return json({requires_email_2fa:true,challenge_id:challenge})}const token=await createSession(env,u.id);return json({user:{id:u.id,username:u.username,email:u.email,status:u.status}},200,{"set-cookie":cookie(token,AGE)})}catch(e){console.error("TC Accounts login failed:",String(e?.message||e));return json({error:"login_unavailable",message:"Sign-in is unavailable. Please try again."},503)}}
if(url.pathname==="/api/login/verify"&&request.method==="POST"){const b=await body(request),challenge=typeof b?.challenge_id==="string"?b.challenge_id:"",code=typeof b?.code==="string"?b.code.trim():"";if(!challenge||challenge.length>128||!/^[0-9]{6}$/.test(code))return json({error:"invalid_verification_code",message:"Enter the six-digit code from your email."},400);try{const challengeHash=await hash(challenge),now=new Date().toISOString(),row=await env.TC.prepare("SELECT c.user_id,c.code_hash,c.attempts,c.expires_at,u.username,u.email,u.status FROM email_2fa_challenges c JOIN users u ON u.id=c.user_id WHERE c.challenge_hash=? LIMIT 1").bind(challengeHash).first();if(!row||row.expires_at<=now||row.status!=="active"){if(row)await env.TC.prepare("DELETE FROM email_2fa_challenges WHERE challenge_hash=?").bind(challengeHash).run();return json({error:"verification_expired",message:"That verification code has expired. Sign in again to request a new one."},400)}if(Number(row.attempts)>=5){await env.TC.prepare("DELETE FROM email_2fa_challenges WHERE challenge_hash=?").bind(challengeHash).run();return json({error:"too_many_attempts",message:"Too many incorrect codes. Sign in again to request another code."},429)}if(await hash(challenge+":"+code)!==row.code_hash){const attempts=Number(row.attempts)+1;if(attempts>=5)await env.TC.prepare("DELETE FROM email_2fa_challenges WHERE challenge_hash=?").bind(challengeHash).run();else await env.TC.prepare("UPDATE email_2fa_challenges SET attempts=? WHERE challenge_hash=?").bind(attempts,challengeHash).run();return json({error:"invalid_verification_code",message:attempts>=5?"Too many incorrect codes. Sign in again to request another code.":"That code is incorrect. Check the email and try again."},401)}await env.TC.prepare("DELETE FROM email_2fa_challenges WHERE challenge_hash=?").bind(challengeHash).run();const token=await createSession(env,row.user_id);return json({user:{id:row.user_id,username:row.username,email:row.email,status:row.status}},200,{"set-cookie":cookie(token,AGE)})}catch(e){console.error("TC email 2FA verification failed:",String(e?.message||e));return json({error:"verification_unavailable",message:"Verification is temporarily unavailable. Please try again."},503)}}
if(url.pathname==="/api/email/change/request"&&request.method==="POST"){
const u=await session(request,env);if(!u)return json({error:"not_authenticated",message:"Sign in again before changing your email."},401);
const b=await body(request),newEmail=typeof b?.email==="string"?b.email.trim().toLowerCase():"",currentPassword=typeof b?.currentPassword==="string"?b.currentPassword:"";
if(newEmail.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail))return json({error:"invalid_email",message:"Enter a valid new email address."},400);
if(!currentPassword)return json({error:"missing_password",message:"Enter your current password to request an email change."},400);
if(newEmail===String(u.email).toLowerCase())return json({error:"same_email",message:"That is already your current email address."},400);
try{
const account=await env.TC.prepare("SELECT id,username,email,password_hash FROM users WHERE id=? AND status='active'").bind(u.user_id).first();
if(!account||!(await verify(currentPassword,account.password_hash)))return json({error:"incorrect_password",message:"Your current password is incorrect."},401);
const existing=await env.TC.prepare("SELECT id FROM users WHERE email=? COLLATE NOCASE AND id<>? LIMIT 1").bind(newEmail,u.user_id).first();
if(existing)return json({error:"email_in_use",message:"That email address is already associated with another TC account."},409);
const now=new Date().toISOString(),challenge=random(32),challengeHash=await hash(challenge),code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,"0"),expires=new Date(Date.now()+10*60*1000).toISOString();
await env.TC.prepare("DELETE FROM email_change_challenges WHERE user_id=?").bind(u.user_id).run();
await env.TC.prepare("INSERT INTO email_change_challenges(challenge_hash,user_id,new_email,code_hash,attempts,expires_at,created_at) VALUES(?,?,?,?,0,?,?)").bind(challengeHash,u.user_id,newEmail,await hash(challenge+":"+code),expires,now).run();
try{await sendEventNotification(env,{email:newEmail,username:account.username},"Verify your new TC Accounts email","Hello, "+account.username+"\r\n\r\nYour TC Accounts email change verification code is: "+code+"\r\n\r\nEnter this six-digit code in TC Accounts to change your registered email address. It expires in 10 minutes. Your current email remains active until verification succeeds. If you did not request this change, you can ignore this email.\r\n\r\nBest, TC")}catch(e){await env.TC.prepare("DELETE FROM email_change_challenges WHERE challenge_hash=?").bind(challengeHash).run();throw e}
return json({success:true,challenge_id:challenge,message:"A verification code has been sent to your new email address."});
}catch(e){console.error("TC email-change verification request failed:",String(e?.message||e));return json({error:"email_change_unavailable",message:"The verification email could not be sent. Your current email address has not changed."},503)}
}
if(url.pathname==="/api/email/change/verify"&&request.method==="POST"){
const u=await session(request,env);if(!u)return json({error:"not_authenticated",message:"Sign in again before verifying your new email."},401);
const b=await body(request),challenge=typeof b?.challenge_id==="string"?b.challenge_id:"",code=typeof b?.code==="string"?b.code.trim():"";
if(!challenge||challenge.length>128||!/^[0-9]{6}$/.test(code))return json({error:"invalid_verification_code",message:"Enter the six-digit code from your new email address."},400);
try{
const challengeHash=await hash(challenge),now=new Date().toISOString(),row=await env.TC.prepare("SELECT * FROM email_change_challenges WHERE challenge_hash=? AND user_id=?").bind(challengeHash,u.user_id).first();
if(!row||row.expires_at<=now){if(row)await env.TC.prepare("DELETE FROM email_change_challenges WHERE challenge_hash=?").bind(challengeHash).run();return json({error:"verification_expired",message:"That code has expired. Request a new email change code."},400)}
if(Number(row.attempts)>=5){await env.TC.prepare("DELETE FROM email_change_challenges WHERE challenge_hash=?").bind(challengeHash).run();return json({error:"too_many_attempts",message:"Too many incorrect codes. Request a new email change code."},429)}
if(await hash(challenge+":"+code)!==row.code_hash){const attempts=Number(row.attempts)+1;if(attempts>=5)await env.TC.prepare("DELETE FROM email_change_challenges WHERE challenge_hash=?").bind(challengeHash).run();else await env.TC.prepare("UPDATE email_change_challenges SET attempts=? WHERE challenge_hash=?").bind(attempts,challengeHash).run();return json({error:"invalid_verification_code",message:attempts>=5?"Too many incorrect codes. Request a new code.":"That code is incorrect. Check the email and try again."},401)}
const existing=await env.TC.prepare("SELECT id FROM users WHERE email=? COLLATE NOCASE AND id<>? LIMIT 1").bind(row.new_email,u.user_id).first();
if(existing){await env.TC.prepare("DELETE FROM email_change_challenges WHERE challenge_hash=?").bind(challengeHash).run();return json({error:"email_in_use",message:"That email address is already associated with another TC account."},409)}
const changed=await env.TC.prepare("UPDATE users SET email=?,updated_at=? WHERE id=? AND status='active'").bind(row.new_email,now,u.user_id).run();
if(!changed.meta?.changes)return json({error:"email_change_failed",message:"Your email address could not be changed."},400);
await env.TC.prepare("DELETE FROM email_change_challenges WHERE user_id=?").bind(u.user_id).run();
return json({success:true,email:row.new_email,message:"Your email address has been verified and updated."});
}catch(e){console.error("TC email-change verification failed:",String(e?.message||e));return json({error:"email_change_unavailable",message:"Email verification is temporarily unavailable. Your current email remains unchanged."},503)}
}
if(url.pathname==="/api/security/email-2fa"&&request.method==="POST"){const u=await session(request,env);if(!u)return json({error:"not_authenticated",message:"Sign in again to update your security settings."},401);const b=await body(request),enabled=b?.enabled===true,currentPassword=typeof b?.currentPassword==="string"?b.currentPassword:"";if(typeof b?.enabled!=="boolean"||!currentPassword)return json({error:"missing_confirmation",message:"Enter your current password to change this setting."},400);try{const account=await env.TC.prepare("SELECT password_hash FROM users WHERE id=? AND status='active'").bind(u.user_id).first();if(!account||!(await verify(currentPassword,account.password_hash)))return json({error:"incorrect_password",message:"Your current password is incorrect."},401);await env.TC.prepare("UPDATE users SET email_2fa_enabled=?,updated_at=? WHERE id=?").bind(enabled?1:0,new Date().toISOString(),u.user_id).run();if(!enabled)await env.TC.prepare("DELETE FROM email_2fa_challenges WHERE user_id=?").bind(u.user_id).run();return json({success:true,email_2fa_enabled:enabled,message:enabled?"Email two-factor authentication is now enabled.":"Email two-factor authentication is now disabled."})}catch(e){console.error("TC email 2FA setting update failed:",String(e?.message||e));return json({error:"security_setting_unavailable",message:"Your security setting could not be updated. Apply the TCAccounts database migration and try again."},503)}}
if(url.pathname==="/api/me"&&request.method==="GET"){try{const u=await session(request,env);if(!u)return json({error:"not_authenticated"},401);const account=await env.TC.prepare("SELECT role,email_2fa_enabled FROM users WHERE id=?").bind(u.user_id).first();return json({user:{id:u.user_id,username:u.username,email:u.email,status:u.status,role:Number(account?.role??1),email_2fa_enabled:Number(account?.email_2fa_enabled??0)===1}})}catch(e){console.error("TC Accounts session lookup failed:",String(e?.message||e));return json({error:"session_unavailable"},503)}}
if(url.pathname==="/api/logout"&&request.method==="POST"){const t=getCookie(request);try{if(t)await env.TC.prepare("DELETE FROM sessions WHERE id_hash=?").bind(await hash(t)).run();return json({success:true},200,{"set-cookie":cookie("",0)})}catch(e){console.error("TC Accounts logout failed:",String(e?.message||e));return json({error:"logout_failed"},503)}}
if(url.pathname==="/api/accounts"&&request.method==="GET"){try{const u=await session(request,env);return u?json({user:{id:u.user_id,username:u.username,email:u.email,status:u.status},message:"Signed in to TC Accounts."}):json({error:"not_authenticated"},401)}catch(e){console.error("TC Accounts accounts lookup failed:",String(e?.message||e));return json({error:"accounts_unavailable"},503)}}

if(url.pathname==="/.well-known/oauth-authorization-server"&&request.method==="GET"){return json({issuer:"https://accounts.theegget.com",authorization_endpoint:"https://accounts.theegget.com/oauth/authorize",token_endpoint:"https://accounts.theegget.com/oauth/token",userinfo_endpoint:"https://accounts.theegget.com/oauth/userinfo",revocation_endpoint:"https://accounts.theegget.com/oauth/revoke",response_types_supported:["code"],grant_types_supported:["authorization_code"],code_challenge_methods_supported:["S256"],scopes_supported:["profile","email"]})}
if(url.pathname==="/api/oauth/clients"&&request.method==="GET"){
try{const u=await session(request,env);if(!u)return json({error:"not_authenticated"},401);const rows=await env.TC.prepare("SELECT client_id,name,redirect_uris_json,scopes_json,created_at FROM oauth_clients WHERE owner_user_id=? ORDER BY created_at DESC").bind(u.user_id).all();return json({clients:(rows.results||[]).map(c=>({...c,redirect_uris:JSON.parse(c.redirect_uris_json),scopes:JSON.parse(c.scopes_json)}))})}catch(e){console.error("OAuth client list failed:",String(e?.message||e));return json({error:"oauth_not_ready",message:"OAuth database migration must be applied first."},503)}}
if(url.pathname==="/api/oauth/clients"&&request.method==="POST"){
const u=await session(request,env);if(!u)return json({error:"not_authenticated"},401);const b=await body(request),name=typeof b?.name==="string"?b.name.trim():"",redirects=Array.isArray(b?.redirect_uris)?b.redirect_uris:[],scopes=Array.isArray(b?.scopes)?b.scopes:["profile"];
if(name.length<2||name.length>80||redirects.length<1||redirects.length>10||scopes.length<1||scopes.some(s=>!["profile","email"].includes(s)))return json({error:"invalid_client_data",message:"Provide an app name, 1–10 redirect URLs, and supported scopes."},400);
for(const value of redirects){if(typeof value!=="string")return json({error:"invalid_redirect_uri"},400);try{const x=new URL(value);if(x.protocol!=="https:"&&x.hostname!=="localhost")return json({error:"invalid_redirect_uri",message:"Redirect URLs must use HTTPS (localhost is allowed for development)."},400);if(x.username||x.password||x.hash)return json({error:"invalid_redirect_uri"},400)}catch{return json({error:"invalid_redirect_uri"},400)}}
const clientId="tc_"+random(24),now=new Date().toISOString();try{await env.TC.prepare("INSERT INTO oauth_clients(client_id,owner_user_id,name,redirect_uris_json,scopes_json,created_at) VALUES(?,?,?,?,?,?)").bind(clientId,u.user_id,name,JSON.stringify([...new Set(redirects)]),JSON.stringify([...new Set(scopes)]),now).run();return json({client:{client_id,name,redirect_uris:[...new Set(redirects)],scopes:[...new Set(scopes)],created_at:now}},201)}catch(e){console.error("OAuth client create failed:",String(e?.message||e));return json({error:"oauth_not_ready",message:"OAuth database migration must be applied first."},503)}}
if(url.pathname.startsWith("/api/oauth/clients/")&&request.method==="DELETE"){
const u=await session(request,env);if(!u)return json({error:"not_authenticated"},401);const id=decodeURIComponent(url.pathname.slice("/api/oauth/clients/".length));try{const r=await env.TC.prepare("DELETE FROM oauth_clients WHERE client_id=? AND owner_user_id=?").bind(id,u.user_id).run();return r.meta?.changes?json({success:true}):json({error:"not_found"},404)}catch{return json({error:"oauth_not_ready"},503)}}
if(url.pathname==="/oauth/token"&&request.method==="POST"){
let p;try{p=new URLSearchParams(await request.text())}catch{return corsJson(request,{error:"invalid_request"},400)}
const grant=p.get("grant_type"),code=p.get("code")||"",clientId=p.get("client_id")||"",redirectUri=p.get("redirect_uri")||"",verifier=p.get("code_verifier")||"";
if(grant!=="authorization_code"||!code||!clientId||!redirectUri||!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier))return corsJson(request,{error:"invalid_request"},400);
try{const row=await env.TC.prepare("SELECT * FROM oauth_codes WHERE code_hash=? AND client_id=? AND redirect_uri=? AND expires_at>?").bind(await hash(code),clientId,redirectUri,new Date().toISOString()).first();if(!row)return corsJson(request,{error:"invalid_grant"},400);if(await hash(verifier)!==row.code_challenge)return corsJson(request,{error:"invalid_grant"},400);await env.TC.prepare("DELETE FROM oauth_codes WHERE code_hash=?").bind(await hash(code)).run();const access=random(32),now=new Date().toISOString(),expires=new Date(Date.now()+3600000).toISOString();await env.TC.prepare("INSERT INTO oauth_tokens(token_hash,client_id,user_id,scope,expires_at,created_at) VALUES(?,?,?,?,?,?)").bind(await hash(access),clientId,row.user_id,row.scope,expires,now).run();return corsJson(request,{access_token:access,token_type:"Bearer",expires_in:3600,scope:row.scope})}catch(e){console.error("OAuth token exchange failed:",String(e?.message||e));return corsJson(request,{error:"oauth_not_ready",error_description:"OAuth database migration must be applied first."},503)}}
if(url.pathname==="/oauth/userinfo"&&request.method==="GET"){
const auth=request.headers.get("authorization")||"",token=auth.startsWith("Bearer ")?auth.slice(7):"";if(!token)return corsJson(request,{error:"invalid_token"},401,{"www-authenticate":"Bearer"});try{const row=await env.TC.prepare("SELECT t.scope,u.id,u.username,u.email FROM oauth_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.revoked_at IS NULL AND t.expires_at>? AND u.status='active'").bind(await hash(token),new Date().toISOString()).first();if(!row)return corsJson(request,{error:"invalid_token"},401,{"www-authenticate":"Bearer"});const data={sub:String(row.id),preferred_username:row.username};if(row.scope.split(" ").includes("email"))data.email=row.email;return corsJson(request,data)}catch{return corsJson(request,{error:"oauth_not_ready"},503)}}
if(url.pathname==="/oauth/revoke"&&request.method==="POST"){
let p;try{p=new URLSearchParams(await request.text())}catch{return json({error:"invalid_request"},400)}const token=p.get("token")||"";if(token){try{await env.TC.prepare("UPDATE oauth_tokens SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL").bind(new Date().toISOString(),await hash(token)).run()}catch{return json({error:"oauth_not_ready"},503)}}return new Response(null,{status:200,headers:{"cache-control":"no-store"}})}


if(url.pathname==="/oauth/authorize"&&request.method==="GET"){
const clientId=url.searchParams.get("client_id")||"",redirectUri=url.searchParams.get("redirect_uri")||"",responseType=url.searchParams.get("response_type")||"",scope=(url.searchParams.get("scope")||"profile").split(/\s+/).filter(Boolean),state=url.searchParams.get("state")||"",challenge=url.searchParams.get("code_challenge")||"",method=url.searchParams.get("code_challenge_method")||"";
if(responseType!=="code"||!clientId||!redirectUri||!state||state.length>512||!challenge||method!=="S256"||!/^[A-Za-z0-9_-]{43,128}$/.test(challenge))return json({error:"invalid_request"},400);
let client;try{client=await env.TC.prepare("SELECT client_id,name,redirect_uris_json,scopes_json FROM oauth_clients WHERE client_id=?").bind(clientId).first()}catch{return json({error:"oauth_not_ready"},503)}
if(!client)return json({error:"invalid_client"},400);
let redirects,allowed;try{redirects=JSON.parse(client.redirect_uris_json);allowed=JSON.parse(client.scopes_json)}catch{return json({error:"invalid_client"},400)}
if(!redirects.includes(redirectUri))return json({error:"invalid_redirect_uri"},400);
if(scope.some(s=>!allowed.includes(s))||scope.some(s=>!["profile","email"].includes(s)))return json({error:"invalid_scope"},400);
const u=await session(request,env);if(!u){const login=new URL("/login",url.origin);login.searchParams.set("return_to",url.pathname+url.search);return Response.redirect(login.toString(),302)}
const esc=s=>String(s).replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
const fields={client_id:clientId,redirect_uri:redirectUri,response_type:responseType,scope:scope.join(" "),state,code_challenge:challenge,code_challenge_method:method};
const hidden=Object.entries(fields).map(([k,v])=>'<input type="hidden" name="'+k+'" value="'+esc(v)+'">').join("");
const html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authorize '+esc(client.name)+' · TC Accounts</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080808;color:#f5f5f5;font:15px system-ui;padding:24px}.card{width:min(100%,440px);border:1px solid #303030;border-radius:18px;padding:28px;background:#111}h1{font-size:24px;margin:0 0 8px}p{color:#aaa;line-height:1.6}.app{padding:14px;border:1px solid #333;border-radius:10px;margin:20px 0}li{margin:8px 0;color:#ddd}button{width:100%;padding:13px;border:0;border-radius:9px;background:#fff;color:#111;font-weight:700;font-size:14px;cursor:pointer}.deny{display:block;text-align:center;margin-top:16px;color:#aaa}small{color:#777}</style><main class="card"><small>THEEGGET CREATIONS · TC ACCOUNTS</small><h1>Authorize application</h1><p>Review what this application will be allowed to access before continuing.</p><div class="app"><strong>'+esc(client.name)+'</strong><p>Requested permissions:</p><ul>'+scope.map(s=>'<li>'+({profile:"View your TC username and account ID",email:"View the email address on your TC account"}[s])+'</li>').join("")+'</ul></div><p>Only approve this if you trust the application. You can revoke access by deleting its OAuth registration.</p><form method="post" action="'+url.origin+'/oauth/authorize/approve" accept-charset="UTF-8">'+hidden+'<button type="submit">Approve access</button></form><a class="deny" href="'+esc(redirectUri)+(redirectUri.includes("?")?"&":"?")+"error=access_denied&state="+encodeURIComponent(state)+'">Cancel</a></main></html>';
return new Response(html,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","content-security-policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'","x-frame-options":"DENY","referrer-policy":"no-referrer"}})}
if(url.pathname==="/oauth/authorize/approve"&&request.method==="POST"){
const p=new URLSearchParams(await request.text()),clientId=p.get("client_id")||"",redirectUri=p.get("redirect_uri")||"",state=p.get("state")||"",challenge=p.get("code_challenge")||"",method=p.get("code_challenge_method")||"",scope=(p.get("scope")||"profile").split(/\s+/).filter(Boolean);
if(!clientId||!redirectUri||!state||!challenge||method!=="S256")return json({error:"invalid_request"},400);
const u=await session(request,env);if(!u){console.log("OAuth approval: session missing; redirecting to sign-in");const original=new URL("/oauth/authorize",url.origin);for(const key of ["client_id","redirect_uri","response_type","scope","state","code_challenge","code_challenge_method"]){const value=p.get(key);if(value!==null)original.searchParams.set(key,value)}const login=new URL("/login",url.origin);login.searchParams.set("return_to",original.pathname+original.search);console.log("OAuth approval requires a fresh login");return Response.redirect(login.toString(),303);}
try{console.log("OAuth approval: session present; validating client and saving authorization code");const client=await env.TC.prepare("SELECT name,redirect_uris_json,scopes_json FROM oauth_clients WHERE client_id=?").bind(clientId).first();if(!client)return json({error:"invalid_client"},400);if(!JSON.parse(client.redirect_uris_json).includes(redirectUri)||scope.some(s=>!JSON.parse(client.scopes_json).includes(s)||!["profile","email"].includes(s)))return json({error:"invalid_request"},400);const code=random(32),now=new Date().toISOString(),expires=new Date(Date.now()+300000).toISOString();await env.TC.prepare("INSERT INTO oauth_codes(code_hash,client_id,user_id,redirect_uri,scope,code_challenge,code_challenge_method,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(await hash(code),clientId,u.user_id,redirectUri,scope.join(" "),challenge,"S256",expires,now).run();try{const template=TC_NOTIFICATION_TEMPLATES.applicationAuthorized;await sendEventNotification(env,u,template.subject,template.render({username:u.username,application:client.name}))}catch(e){console.error("TC application-authorization notification failed:",String(e?.message||e))}const target=new URL(redirectUri);target.searchParams.set("code",code);target.searchParams.set("state",state);const destination=target.toString();const safeDestination=destination.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");console.log("OAuth approval: authorization code saved; redirecting browser to "+target.origin+target.pathname);return new Response('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url='+safeDestination+'"><title>Continuing sign-in…</title></head><body style="margin:0;background:#080808;color:#f5f5f5;font:15px system-ui;display:grid;min-height:100vh;place-items:center"><main style="padding:24px;text-align:center"><p>Approval complete. Returning to the application…</p><a style="color:#fff" href="'+safeDestination+'">Continue</a></main><script>window.location.replace('+JSON.stringify(destination)+')</script></body></html>',{status:200,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","referrer-policy":"no-referrer","content-security-policy":"default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; base-uri \'none\'; frame-ancestors \'none\'"}})}catch(e){console.error("OAuth approval failed:",String(e?.stack||e?.message||e));return new Response('<!doctype html><meta charset="utf-8"><title>Authorization failed</title><main style="font:15px system-ui;max-width:520px;margin:12vh auto;padding:24px;color:#eee;background:#111;border:1px solid #333;border-radius:14px"><h1>Authorization could not be completed</h1><p>TC Accounts could not save this approval. Return to the application and try again.</p><a style="color:#fff" href="/login">Sign in again</a></main>',{status:503,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}})}}

if(url.pathname.startsWith("/api/support/mailbox/")){
const origin=request.headers.get("origin")||"";
if(request.method==="OPTIONS")return origin==="https://admin.theegget.com"?new Response(null,{status:204,headers:{"access-control-allow-origin":origin,"access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"authorization, content-type","access-control-max-age":"86400","vary":"Origin"}}):json({error:"origin_not_allowed"},403);
if(request.method!=="POST")return json({error:"method_not_allowed"},405);
const auth=await authorizeSupportMailbox(request,env);if(auth.error)return auth.error;
const b=await body(request),email=mailboxAddress(b?.email),password=typeof b?.password==="string"?b.password:"";
if(!email)return supportJson(auth.origin,{error:"tc_email_required",message:"Use a valid @theegget.com mailbox address."},400);
if(!password||password.length>1024||/[\r\n\0]/.test(password))return supportJson(auth.origin,{error:"missing_credentials",message:"Enter a valid mailbox password."},400);
try{
if(url.pathname==="/api/support/mailbox/login"){
const imap=await openImap(email,password,env);await imap.close();
return supportJson(auth.origin,{success:true,email,message:"Mailbox connected."});
}
if(url.pathname==="/api/support/mailbox/inbox"){
const result=await mailboxInbox(email,password,env);return supportJson(auth.origin,result);
}
if(url.pathname==="/api/support/mailbox/message"){
const uid=Number(b?.uid);if(!Number.isSafeInteger(uid)||uid<1)return supportJson(auth.origin,{error:"invalid_message"},400);
const result=await mailboxMessage(email,password,uid,env);return supportJson(auth.origin,result);
}
if(url.pathname==="/api/support/mailbox/reply"){
const uid=Number(b?.uid),reply=typeof b?.message==="string"?b.message.trim():"";
if(!Number.isSafeInteger(uid)||uid<1||!reply||reply.length>20000)return supportJson(auth.origin,{error:"invalid_reply",message:"Enter a reply of up to 20,000 characters."},400);
const original=await mailboxMessage(email,password,uid,env);
const match=original.from.match(/<([^<>]+)>/),recipient=(match?.[1]||original.from).trim();
if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)||recipient.toLowerCase()===email)return supportJson(auth.origin,{error:"invalid_recipient",message:"The original sender address could not be verified."},400);
const subject=/^re:/i.test(original.subject)?original.subject:"Re: "+original.subject;
await sendMailboxReply(email,password,recipient,subject,reply,original,env);
return supportJson(auth.origin,{success:true,message:"Reply sent to the original sender."});
}
return supportJson(auth.origin,{error:"not_found"},404);
}catch(e){
const message=String(e?.message||"");
const status=/incorrect|authentication|login/i.test(message)?401:503;
console.error("Support mailbox request failed:",message);
return supportJson(auth.origin,{error:status===401?"invalid_credentials":"mailbox_unavailable",message:status===401?"The TC mailbox address or password is incorrect.":"The mailbox could not be reached or processed. Try again later."},status);
}
}
if(url.pathname.startsWith("/api/"))return json({error:"not_found"},404);return env.ASSETS.fetch(request)}};