export function dateKey(now=Date.now(),timezone='Asia/Seoul'){
 try{return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));}
 catch{return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));}
}
export function dayBefore(day){return new Date(new Date(day+'T12:00:00.000Z').getTime()-86400000).toISOString().slice(0,10);}
export function dailyBaseLimit(env){const n=Number(env.GEMINI_DAILY_PER_IP??'5');return Number.isFinite(n)&&n>=0?Math.min(1000,Math.floor(n)):5;}
export function effectiveLimit(base,previous){return base+(previous?.outage?Math.floor(Math.max(0,previous.used)/2):0);}
export async function sha256(text){const bytes=new TextEncoder().encode(text);const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function visitorHash(request,env){
 if(!env.IP_HASH_SALT||String(env.IP_HASH_SALT).length<12)return null;
 // This trusted header is set/overwritten by Cloudflare on deployed Pages.
 const ip=request.headers.get('CF-Connecting-IP');
 if(!ip)return null; // No raw-IP fallback from spoofable X-Forwarded-For.
 return sha256(String(env.IP_HASH_SALT)+':'+ip);
}
export async function getCache(db,id){return db.prepare('SELECT interpretation,model FROM meaning_cache WHERE id=?').bind(id).first();}
export async function putCache(db,id,text,model){return db.prepare('INSERT INTO meaning_cache(id,interpretation,model,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id,text,model,Date.now()).run();}
export async function getQuota(db,day,visitor,env){
 const old=await db.prepare('SELECT used,outage FROM daily_usage WHERE day=? AND ip_hash=?').bind(dayBefore(day),visitor).first();
 const current=await db.prepare('SELECT used,outage FROM daily_usage WHERE day=? AND ip_hash=?').bind(day,visitor).first();
 const limit=effectiveLimit(dailyBaseLimit(env),old);
 return {used:current?.used||0,limit,remaining:Math.max(0,limit-(current?.used||0)),bonus:limit-dailyBaseLimit(env)};
}
export async function reserveQuota(db,day,visitor,limit){
 if(limit<1)return false;
 const result=await db.prepare(`INSERT INTO daily_usage(day,ip_hash,used,outage) VALUES(?,?,1,0)
 ON CONFLICT(day,ip_hash) DO UPDATE SET used=daily_usage.used+1
 WHERE daily_usage.used<? RETURNING used`).bind(day,visitor,limit).first();
 return !!result;
}
export async function refundQuota(db,day,visitor){return db.prepare('UPDATE daily_usage SET used=MAX(used-1,0) WHERE day=? AND ip_hash=?').bind(day,visitor).run();}
export async function markOutage(db,day,visitor){return db.prepare(`INSERT INTO daily_usage(day,ip_hash,used,outage) VALUES(?,?,0,1)
 ON CONFLICT(day,ip_hash) DO UPDATE SET outage=1`).bind(day,visitor).run();}
export async function isOutage(db){const row=await db.prepare("SELECT blocked_until FROM api_state WHERE id='gemini'").first();return !!row&&row.blocked_until>Date.now();}
export async function reportOutage(db,ms=300000){return db.prepare("INSERT INTO api_state(id,blocked_until) VALUES('gemini',?) ON CONFLICT(id) DO UPDATE SET blocked_until=excluded.blocked_until").bind(Date.now()+ms).run();}
export async function clearOutage(db){return db.prepare("DELETE FROM api_state WHERE id='gemini'").run();}
export async function lockMeaning(db,id){const result=await db.prepare(`INSERT INTO meaning_locks(id,expires_at) VALUES(?,?) ON CONFLICT(id)
 DO UPDATE SET expires_at=excluded.expires_at WHERE meaning_locks.expires_at<? RETURNING id`).bind(id,Date.now()+65000,Date.now()).first();return !!result;}
export async function unlockMeaning(db,id){return db.prepare('DELETE FROM meaning_locks WHERE id=?').bind(id).run();}
