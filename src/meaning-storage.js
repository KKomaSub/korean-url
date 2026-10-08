export function dateKey(now=Date.now(),timezone='Asia/Seoul'){
 try{return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));}
 catch{return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));}
}
export function dayBefore(day){return new Date(new Date(day+'T12:00:00.000Z').getTime()-86400000).toISOString().slice(0,10);}
export function dailyBaseLimit(env){const n=Number(env.GEMINI_DAILY_PER_DEVICE??env.GEMINI_DAILY_PER_IP??'5');return Number.isFinite(n)&&n>=0?Math.min(1000,Math.floor(n)):5;}
export function effectiveLimit(base,previous){return base+(previous?.outage?Math.floor(Math.max(0,previous.used)/2):0);}
export async function sha256(text){const bytes=new TextEncoder().encode(text);const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');}
// The client sends only a SHA-256 digest of first-party browser features and a local random identifier.
// D1 stores only a second, secret-salted hash. No IP address, raw features, or persistent cross-site identifier is stored.
export async function visitorHash(fingerprint,env){
 if(typeof fingerprint!=='string'||!/^[a-f0-9]{64}$/i.test(fingerprint))return null;
 const salt=env.FINGERPRINT_HASH_SALT||env.IP_HASH_SALT;
 if(typeof salt!=='string'||salt.length<12)return null;
 return sha256('device:v1:'+salt+':'+fingerprint.toLowerCase());
}
export async function getCache(db,id){return db.prepare('SELECT interpretation,model FROM meaning_cache WHERE id=?').bind(id).first();}
export async function putCache(db,id,text,model){return db.prepare('INSERT INTO meaning_cache(id,interpretation,model,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id,text,model,Date.now()).run();}
export async function getQuota(db,day,device,env){
 const old=await db.prepare('SELECT used,outage FROM device_usage WHERE day=? AND device_hash=?').bind(dayBefore(day),device).first();
 const current=await db.prepare('SELECT used,outage FROM device_usage WHERE day=? AND device_hash=?').bind(day,device).first();
 const limit=effectiveLimit(dailyBaseLimit(env),old);
 return {used:current?.used||0,limit,remaining:Math.max(0,limit-(current?.used||0)),bonus:limit-dailyBaseLimit(env)};
}
export async function reserveQuota(db,day,device,limit){
 if(limit<1)return false;
 const result=await db.prepare(`INSERT INTO device_usage(day,device_hash,used,outage) VALUES(?,?,1,0)
 ON CONFLICT(day,device_hash) DO UPDATE SET used=device_usage.used+1
 WHERE device_usage.used<? RETURNING used`).bind(day,device,limit).first();
 return !!result;
}
export async function refundQuota(db,day,device){return db.prepare('UPDATE device_usage SET used=MAX(used-1,0) WHERE day=? AND device_hash=?').bind(day,device).run();}
export async function markOutage(db,day,device){return db.prepare(`INSERT INTO device_usage(day,device_hash,used,outage) VALUES(?,?,0,1)
 ON CONFLICT(day,device_hash) DO UPDATE SET outage=1`).bind(day,device).run();}
// The original global api_state block is intentionally no longer consulted: it locked out *all* healthy keys.
export async function lockMeaning(db,id){const result=await db.prepare(`INSERT INTO meaning_locks(id,expires_at) VALUES(?,?) ON CONFLICT(id)
 DO UPDATE SET expires_at=excluded.expires_at WHERE meaning_locks.expires_at<? RETURNING id`).bind(id,Date.now()+180000,Date.now()).first();return !!result;}
export async function unlockMeaning(db,id){return db.prepare('DELETE FROM meaning_locks WHERE id=?').bind(id).run();}