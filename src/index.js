const VERSION='8.0.0';
const te=new TextEncoder();
const SECURITY_HEADERS={
  'x-content-type-options':'nosniff',
  'x-frame-options':'DENY',
  'referrer-policy':'strict-origin-when-cross-origin',
  'permissions-policy':'camera=(), microphone=(), geolocation=()',
  'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; frame-src 'self' https:; connect-src 'self' https:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store',...SECURITY_HEADERS,...headers}});
const statusError=(status,message)=>Object.assign(new Error(message),{status});
const clean=s=>String(s??'').trim();
const validEmail=e=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(e));
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const random=n=>{const a=new Uint8Array(n);crypto.getRandomValues(a);return hex(a)};
const sha=async s=>hex(await crypto.subtle.digest('SHA-256',te.encode(String(s))));
const cookie=(r,n)=>(r.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(`${n}=`))?.slice(n.length+1);
const body=async r=>{try{return await r.json()}catch{throw statusError(400,'صيغة الطلب غير صحيحة')}};
const roleRank={editor:1,admin:2,owner:3};

async function passwordHash(password,salt=random(16)){
  const key=await crypto.subtle.importKey('raw',te.encode(String(password)),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:te.encode(salt),iterations:100000,hash:'SHA-256'},key,256);
  return `${salt}$${hex(bits)}`;
}
async function verifyPassword(password,stored){
  if(!stored||!stored.includes('$'))return false;
  const actual=await passwordHash(password,stored.split('$')[0]);
  if(actual.length!==stored.length)return false;
  let diff=0;for(let i=0;i<actual.length;i++)diff|=actual.charCodeAt(i)^stored.charCodeAt(i);
  return diff===0;
}
function sessionCookie(r,value,maxAge){
  const secure=new URL(r.url).protocol==='https:'?'; Secure':'';
  return `bfa_session=${value}; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=${maxAge}`;
}
function sameOrigin(r){const o=r.headers.get('origin');return !o||o===new URL(r.url).origin}
function normalizeDate(value){const v=clean(value);if(!v)return null;const s=v.replace('T',' ').slice(0,19);return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(s)?s:null}
function cleanTags(value){return [...new Set(clean(value).split(',').map(x=>x.trim()).filter(Boolean))].slice(0,20).join(', ')}
function validateExternalUrl(value){
  try{
    const url=new URL(clean(value));
    if(url.protocol!=='https:')return false;
    const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,'');
    if(!host||['localhost','0.0.0.0','::','::1'].includes(host)||host.endsWith('.localhost')||host.endsWith('.internal')||host.endsWith('.local')||/^(fc|fd)[0-9a-f]{2}:/i.test(host)||/^fe[89ab][0-9a-f]:/i.test(host)||host.includes('::ffff:'))return false;
    const ip=host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if(ip){const [a,b,c,d]=ip.slice(1).map(Number);if([a,b,c,d].some(n=>n>255))return false;if(a===10||a===127||a===0||a===169&&b===254||a===192&&b===168||a===172&&b>=16&&b<=31)return false}
    return true;
  }catch{return false}
}
function optionalUrl(value){const v=clean(value);return !v||validateExternalUrl(v)}
function detectProvider(value){
  try{const host=new URL(value).hostname.toLowerCase();if(host.includes('drive.google.com'))return'google-drive';if(host.includes('docs.google.com'))return'google-docs';if(host.includes('onedrive.live.com')||host.includes('1drv.ms'))return'onedrive';if(host.includes('dropbox.com'))return'dropbox';if(host.includes('github.com'))return'github';if(host.includes('t.me')||host.includes('telegram.me'))return'telegram';return host}catch{return'external'}
}
async function list(e,sql,...args){const st=e.DB.prepare(sql);return(await(args.length?st.bind(...args):st).all()).results||[]}
let ready;
async function schema(env){
  if(!env.DB||typeof env.DB.prepare!=='function')throw statusError(503,'قاعدة البيانات غير جاهزة أو غير مرتبطة بالمشروع.');
  if(ready)return ready;
  ready=(async()=>{
    const statements=[
      "PRAGMA foreign_keys=ON",
      "CREATE TABLE IF NOT EXISTS admins(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'owner' CHECK(role IN('owner','admin','editor')),status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','disabled')),failed_attempts INTEGER NOT NULL DEFAULT 0,locked_until TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,expires_at TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS subjects(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,code TEXT NOT NULL UNIQUE,department TEXT NOT NULL DEFAULT 'Business',academic_year TEXT NOT NULL DEFAULT '',study_level TEXT NOT NULL DEFAULT '',semester TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'published' CHECK(status IN('published','hidden')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,deleted_at TEXT)",
      "CREATE TABLE IF NOT EXISTS resources(id INTEGER PRIMARY KEY AUTOINCREMENT,subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',resource_url TEXT NOT NULL,mirror_url_1 TEXT,mirror_url_2 TEXT,type TEXT NOT NULL DEFAULT 'PDF',provider TEXT NOT NULL DEFAULT 'external',link_status TEXT NOT NULL DEFAULT 'unknown' CHECK(link_status IN('unknown','ok','error')),last_checked_at TEXT,content_type TEXT NOT NULL DEFAULT 'lectures',lecture_name TEXT NOT NULL DEFAULT '',tags TEXT NOT NULL DEFAULT '',file_size INTEGER NOT NULL DEFAULT 0 CHECK(file_size>=0),status TEXT NOT NULL DEFAULT 'published' CHECK(status IN('published','hidden')),pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN(0,1)),expires_at TEXT,downloads INTEGER NOT NULL DEFAULT 0 CHECK(downloads>=0),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,deleted_at TEXT)",
      "CREATE TABLE IF NOT EXISTS announcements(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,content TEXT NOT NULL,priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN('normal','high')),status TEXT NOT NULL DEFAULT 'published' CHECK(status IN('published','hidden')),pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN(0,1)),starts_at TEXT,ends_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,deleted_at TEXT)",
      "CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,action TEXT NOT NULL,entity TEXT NOT NULL,entity_id TEXT,details TEXT,request_id TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      "CREATE INDEX IF NOT EXISTS idx_subjects_taxonomy ON subjects(deleted_at,status,study_level,semester,department,academic_year)",
      "CREATE INDEX IF NOT EXISTS idx_resources_subject ON resources(subject_id,deleted_at,status,pinned,created_at DESC)",
      "CREATE INDEX IF NOT EXISTS idx_resources_search ON resources(deleted_at,content_type,type,status,created_at DESC)",
      "CREATE INDEX IF NOT EXISTS idx_resources_downloads ON resources(deleted_at,downloads DESC)",
      "CREATE INDEX IF NOT EXISTS idx_resources_expiry ON resources(deleted_at,status,expires_at)",
      "CREATE INDEX IF NOT EXISTS idx_announcements_schedule ON announcements(deleted_at,status,pinned,starts_at,ends_at)",
      "CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at)",
      "CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC)"
    ];
    for(const sql of statements)await env.DB.prepare(sql).run();
    const seeds=[
      ['site_name','Business For All'],['site_description','منصة تعليمية عصرية لطلاب إدارة الأعمال'],['academic_year','2026/2027'],
      ['hero_badge','منصة المواد الدراسية'],['footer_text','Business For All — كل المحتوى الأكاديمي في مكان واحد'],
      ['maintenance_mode','0'],['maintenance_message','نجري بعض التحسينات الآن. ارجع بعد قليل.']
    ];
    for(const[k,v]of seeds)await env.DB.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').bind(k,v).run();
    return true;
  })();
  try{return await ready}catch(err){ready=null;throw err}
}
async function current(r,e){
  const token=cookie(r,'bfa_session');if(!token)return null;
  return e.DB.prepare("SELECT a.id,a.name,a.email,a.role,a.status FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires_at>datetime('now') AND a.status='active'").bind(await sha(token)).first();
}
async function requireAdmin(r,e){const a=await current(r,e);if(!a)throw statusError(401,'انتهت الجلسة أو لم يتم تسجيل الدخول');return a}
function requireRole(a,min='editor'){if((roleRank[a.role]||0)<(roleRank[min]||0))throw statusError(403,'ليست لديك صلاحية لتنفيذ هذه العملية')}
async function audit(e,a,action,entity,id='',details='',requestId=null){await e.DB.prepare('INSERT INTO audit_logs(admin_id,action,entity,entity_id,details,request_id) VALUES(?,?,?,?,?,?)').bind(a?.id||null,action,entity,String(id||''),clean(details),requestId).run()}
async function probeUrl(value){
  if(!validateExternalUrl(value))return{url:value,status:'error',httpStatus:0};
  try{
    let response=await fetch(value,{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(7000)});
    if(response.status===405||response.status===501)response=await fetch(value,{method:'GET',headers:{Range:'bytes=0-0'},redirect:'manual',signal:AbortSignal.timeout(7000)});
    const ok=response.ok||[206,301,302,303,307,308].includes(response.status);
    return{url:value,status:ok?'ok':'error',httpStatus:response.status};
  }catch{return{url:value,status:'error',httpStatus:0}}
}
function resourcePayload(x){
  const resourceUrl=clean(x.resource_url),mirror1=clean(x.mirror_url_1),mirror2=clean(x.mirror_url_2),expires=normalizeDate(x.expires_at);
  if(!resourceUrl||!validateExternalUrl(resourceUrl)||!optionalUrl(mirror1)||!optionalUrl(mirror2))throw statusError(400,'استخدم روابط HTTPS عامة وصالحة فقط');
  if(x.expires_at&&!expires)throw statusError(400,'تاريخ انتهاء الرابط غير صالح');
  return{
    subjectId:Number(x.subject_id),title:clean(x.title),description:clean(x.description),resourceUrl,mirror1:mirror1||null,mirror2:mirror2||null,
    type:clean(x.type)||'PDF',provider:detectProvider(resourceUrl),contentType:clean(x.content_type)||'lectures',lectureName:clean(x.lecture_name),
    tags:cleanTags(x.tags),fileSize:Math.max(0,Number(x.file_size)||0),status:x.status==='hidden'?'hidden':'published',pinned:x.pinned?1:0,expires
  };
}
async function settingsObject(e){const settings=await list(e,'SELECT key,value FROM settings');return Object.fromEntries(settings.map(x=>[x.key,x.value]))}

async function handle(r,e,path,requestId){
  const method=r.method,url=new URL(r.url);
  if(path==='/health'){
    if(!e.DB||typeof e.DB.prepare!=='function')return json({ok:false,version:VERSION,stage:'binding',error:'قاعدة البيانات غير مرتبطة بالمشروع'},503);
    try{const check=await e.DB.prepare("SELECT datetime('now') AS now").first();return json({ok:true,version:VERSION,stage:'ready',databaseTime:check.now})}
    catch(error){return json({ok:false,version:VERSION,stage:'connection',error:'تعذر الاتصال بقاعدة D1',diagnostic:e.APP_ENV==='development'?String(error.message||error).slice(0,240):undefined},503)}
  }
  await schema(e);
  if(path==='/diagnostics'){
    const diagAdmin=await current(r,e);if(!diagAdmin)throw statusError(401,'غير مصرح');const tables=await list(e,"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'d1_migrations' ORDER BY name");
    return json({ok:true,version:VERSION,binding:'DB',r2:false,tables:tables.map(x=>x.name)});
  }
  if(['POST','PUT','PATCH','DELETE'].includes(method)&&!sameOrigin(r))throw statusError(403,'طلب غير موثوق');

  if(path==='/bootstrap/status'){
    const owner=await e.DB.prepare("SELECT id FROM admins WHERE role='owner' LIMIT 1").first();
    return json({needsOwner:!owner,version:VERSION});
  }
  if(path==='/bootstrap/owner'&&method==='POST'){
    const owner=await e.DB.prepare("SELECT id FROM admins WHERE role='owner' LIMIT 1").first();if(owner)throw statusError(409,'تم إنشاء المالك مسبقاً');
    const x=await body(r),name=clean(x.name),email=clean(x.email).toLowerCase(),password=String(x.password||'');
    if(name.length<2)throw statusError(400,'اكتب اسم المالك');if(!validEmail(email))throw statusError(400,'اكتب بريداً صحيحاً');if(password.length<10)throw statusError(400,'كلمة المرور يجب ألا تقل عن 10 أحرف');
    await e.DB.prepare("INSERT INTO admins(name,email,password_hash,role,status) VALUES(?,?,?,'owner','active')").bind(name,email,await passwordHash(password)).run();
    return json({ok:true,message:'تم إنشاء حساب المالك. يمكنك تسجيل الدخول الآن.'},201);
  }
  if(path==='/auth/login'&&method==='POST'){
    const x=await body(r),email=clean(x.email).toLowerCase();
    if(!validEmail(email))throw statusError(401,'البريد أو كلمة المرور غير صحيحة');
    const a=await e.DB.prepare("SELECT *,CASE WHEN locked_until IS NOT NULL AND locked_until>datetime('now') THEN 1 ELSE 0 END AS is_locked FROM admins WHERE email=?").bind(email).first();
    if(!a||a.status!=='active')throw statusError(401,'البريد أو كلمة المرور غير صحيحة');
    if(a.is_locked)throw statusError(429,'الحساب مقفل مؤقتاً. حاول بعد 15 دقيقة');
    if(!await verifyPassword(String(x.password||''),a.password_hash)){
      const n=(Number(a.failed_attempts)||0)+1;
      await e.DB.prepare("UPDATE admins SET failed_attempts=?,locked_until=CASE WHEN ?>=5 THEN datetime('now','+15 minutes') ELSE NULL END WHERE id=?").bind(n,n,a.id).run();
      throw statusError(401,'البريد أو كلمة المرور غير صحيحة');
    }
    await e.DB.prepare('UPDATE admins SET failed_attempts=0,locked_until=NULL WHERE id=?').bind(a.id).run();
    const token=random(32);await e.DB.prepare("INSERT INTO sessions(token_hash,admin_id,expires_at) VALUES(?,?,datetime('now','+7 days'))").bind(await sha(token),a.id).run();
    await audit(e,a,'login','auth','','',requestId);
    return json({ok:true},200,{'set-cookie':sessionCookie(r,token,604800)});
  }
  if(path==='/auth/logout'&&method==='POST'){
    const a=await current(r,e),token=cookie(r,'bfa_session');if(token)await e.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha(token)).run();if(a)await audit(e,a,'logout','auth','','',requestId);
    return json({ok:true},200,{'set-cookie':sessionCookie(r,'',0)});
  }
  if(path==='/me'){
    const a=await current(r,e);return a?json({user:a}):json({error:'غير مسجل'},401);
  }
  if(path==='/public'){
    const q=clean(url.searchParams.get('q')),level=clean(url.searchParams.get('level')),semester=clean(url.searchParams.get('semester')),department=clean(url.searchParams.get('department')),year=clean(url.searchParams.get('year')),contentType=clean(url.searchParams.get('content_type')),tag=clean(url.searchParams.get('tag')),sort=clean(url.searchParams.get('sort'))||'newest',pattern=`%${q}%`,tagPattern=`%${tag}%`;
    const settings=await settingsObject(e);
    if(settings.maintenance_mode==='1')return json({maintenance:true,settings,subjects:[],resources:[],announcements:[],filters:{level,semester,department,year,contentType,tag,sort}},200,{'cache-control':'public,max-age=10,s-maxage=20'});
    const order=sort==='downloads'?'r.pinned DESC,r.downloads DESC':sort==='name'?'r.pinned DESC,r.title COLLATE NOCASE ASC':sort==='size'?'r.pinned DESC,r.file_size DESC':'r.pinned DESC,r.created_at DESC';
    const subjectSql="SELECT * FROM subjects WHERE deleted_at IS NULL AND status='published' AND (?='' OR study_level=?) AND (?='' OR semester=?) AND (?='' OR department=?) AND (?='' OR academic_year=?) ORDER BY name COLLATE NOCASE";
    const resourceSql=`SELECT r.*,s.name subject_name,s.code subject_code,s.study_level,s.semester,s.department,s.academic_year FROM resources r JOIN subjects s ON s.id=r.subject_id WHERE r.deleted_at IS NULL AND s.deleted_at IS NULL AND r.status='published' AND s.status='published' AND (r.expires_at IS NULL OR r.expires_at>datetime('now')) AND (?='' OR s.study_level=?) AND (?='' OR s.semester=?) AND (?='' OR s.department=?) AND (?='' OR s.academic_year=?) AND (?='' OR r.content_type=?) AND (?='' OR r.tags LIKE ?) AND (?='' OR r.title LIKE ? OR r.lecture_name LIKE ? OR r.description LIKE ? OR r.tags LIKE ? OR s.name LIKE ? OR s.code LIKE ?) ORDER BY ${order}`;
    const [subjects,resources,announcements]=await Promise.all([
      list(e,subjectSql,level,level,semester,semester,department,department,year,year),
      list(e,resourceSql,level,level,semester,semester,department,department,year,year,contentType,contentType,tag,tagPattern,q,pattern,pattern,pattern,pattern,pattern,pattern),
      list(e,"SELECT * FROM announcements WHERE deleted_at IS NULL AND status='published' AND (starts_at IS NULL OR starts_at<=datetime('now')) AND (ends_at IS NULL OR ends_at>=datetime('now')) ORDER BY pinned DESC,CASE priority WHEN 'high' THEN 0 ELSE 1 END,created_at DESC LIMIT 20")
    ]);
    const safeResources=resources.filter(item=>validateExternalUrl(item.resource_url)).map(item=>{const m1=optionalUrl(item.mirror_url_1)&&item.mirror_url_1?item.mirror_url_1:null,m2=optionalUrl(item.mirror_url_2)&&item.mirror_url_2?item.mirror_url_2:null;const {resource_url,mirror_url_1,mirror_url_2,...publicItem}=item;return{...publicItem,provider:detectProvider(resource_url),has_mirror_1:Boolean(m1),has_mirror_2:Boolean(m2),mirror_provider_1:m1?detectProvider(m1):null,mirror_provider_2:m2?detectProvider(m2):null}});
    return json({maintenance:false,settings,subjects,resources:safeResources,announcements,filters:{level,semester,department,year,contentType,tag,sort}},200,{'cache-control':'public,max-age=15,s-maxage=45'});
  }
  let m=path.match(/^\/resource\/(\d+)$/);
  if(m&&method==='GET'){
    const f=await e.DB.prepare("SELECT r.* FROM resources r JOIN subjects s ON s.id=r.subject_id WHERE r.id=? AND r.deleted_at IS NULL AND s.deleted_at IS NULL AND r.status='published' AND s.status='published' AND (r.expires_at IS NULL OR r.expires_at>datetime('now'))").bind(+m[1]).first();if(!f)throw statusError(404,'الرابط غير موجود أو انتهت صلاحيته');
    const which=clean(url.searchParams.get('link')),target=which==='mirror1'?f.mirror_url_1:which==='mirror2'?f.mirror_url_2:f.resource_url;
    if(!target||!validateExternalUrl(target))throw statusError(404,'هذا الرابط غير متاح');
    await e.DB.prepare('UPDATE resources SET downloads=downloads+1 WHERE id=?').bind(f.id).run();
    return Response.redirect(target,302);
  }

  const a=await requireAdmin(r,e);
  if(path==='/admin/dashboard'&&method==='GET'){
    const [subjects,resources,announcements,logs,trashCount,teamCount]=await Promise.all([
      list(e,'SELECT * FROM subjects WHERE deleted_at IS NULL ORDER BY id DESC'),
      list(e,'SELECT r.*,s.name subject_name,s.code subject_code FROM resources r JOIN subjects s ON s.id=r.subject_id WHERE r.deleted_at IS NULL AND s.deleted_at IS NULL ORDER BY r.pinned DESC,r.id DESC'),
      list(e,'SELECT * FROM announcements WHERE deleted_at IS NULL ORDER BY pinned DESC,id DESC'),
      list(e,'SELECT l.*,a.name admin_name FROM audit_logs l LEFT JOIN admins a ON a.id=l.admin_id ORDER BY l.id DESC LIMIT 60'),
      e.DB.prepare("SELECT (SELECT COUNT(*) FROM subjects WHERE deleted_at IS NOT NULL)+(SELECT COUNT(*) FROM resources WHERE deleted_at IS NOT NULL)+(SELECT COUNT(*) FROM announcements WHERE deleted_at IS NOT NULL) total").first(),
      e.DB.prepare("SELECT COUNT(*) total FROM admins").first()
    ]);
    return json({subjects,resources,announcements,logs,trashCount:trashCount.total,teamCount:teamCount.total,version:VERSION,noR2:true});
  }
  if(path==='/admin/subjects'&&method==='GET'){
    const page=Math.max(1,Number(url.searchParams.get('page')||1)),limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit')||20))),q=clean(url.searchParams.get('q')),offset=(page-1)*limit,pattern=`%${q}%`;
    const [items,total]=await Promise.all([list(e,'SELECT * FROM subjects WHERE deleted_at IS NULL AND (name LIKE ? OR code LIKE ? OR department LIKE ? OR study_level LIKE ?) ORDER BY created_at DESC LIMIT ? OFFSET ?',pattern,pattern,pattern,pattern,limit,offset),e.DB.prepare('SELECT COUNT(*) total FROM subjects WHERE deleted_at IS NULL AND (name LIKE ? OR code LIKE ? OR department LIKE ? OR study_level LIKE ?)').bind(pattern,pattern,pattern,pattern).first()]);
    return json({items,page,limit,total:total.total,pages:Math.max(1,Math.ceil(total.total/limit))});
  }
  if(path==='/admin/resources'&&method==='GET'){
    const page=Math.max(1,Number(url.searchParams.get('page')||1)),limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit')||20))),q=clean(url.searchParams.get('q')),offset=(page-1)*limit,pattern=`%${q}%`;
    const [items,total]=await Promise.all([list(e,'SELECT r.*,s.name subject_name,s.code subject_code FROM resources r JOIN subjects s ON s.id=r.subject_id WHERE r.deleted_at IS NULL AND s.deleted_at IS NULL AND (r.title LIKE ? OR r.lecture_name LIKE ? OR r.tags LIKE ? OR s.name LIKE ?) ORDER BY r.pinned DESC,r.created_at DESC LIMIT ? OFFSET ?',pattern,pattern,pattern,pattern,limit,offset),e.DB.prepare('SELECT COUNT(*) total FROM resources r JOIN subjects s ON s.id=r.subject_id WHERE r.deleted_at IS NULL AND s.deleted_at IS NULL AND (r.title LIKE ? OR r.lecture_name LIKE ? OR r.tags LIKE ? OR s.name LIKE ?)').bind(pattern,pattern,pattern,pattern).first()]);
    return json({items,page,limit,total:total.total,pages:Math.max(1,Math.ceil(total.total/limit))});
  }
  if(path==='/admin/link-check'&&method==='POST'){
    const x=await body(r),id=Number(x.id),resource=await e.DB.prepare('SELECT * FROM resources WHERE id=? AND deleted_at IS NULL').bind(id).first();if(!resource)throw statusError(404,'الرابط غير موجود');
    const checks=[];for(const [name,value] of [['primary',resource.resource_url],['mirror1',resource.mirror_url_1],['mirror2',resource.mirror_url_2]])if(value)checks.push({name,...await probeUrl(value)});
    const primary=checks.find(x=>x.name==='primary');await e.DB.prepare('UPDATE resources SET link_status=?,last_checked_at=CURRENT_TIMESTAMP WHERE id=?').bind(primary?.status||'error',id).run();
    await audit(e,a,'check','resource',id,checks.map(x=>`${x.name}:${x.status}:${x.httpStatus}`).join('|'),requestId);return json({ok:primary?.status==='ok',linkStatus:primary?.status||'error',checks});
  }
  if(path==='/admin/resources/bulk'&&method==='POST'){
    requireRole(a,'editor');const x=await body(r),items=Array.isArray(x.items)?x.items:[];if(!items.length)throw statusError(400,'لا توجد عناصر للاستيراد');if(items.length>200)throw statusError(413,'الحد الأقصى 200 ملف في العملية الواحدة');
    const subjects=await list(e,'SELECT id,code FROM subjects WHERE deleted_at IS NULL');const byCode=new Map(subjects.map(s=>[String(s.code).toLowerCase(),s.id]));const validIds=new Set(subjects.map(s=>Number(s.id)));const statements=[];let imported=0;
    for(let i=0;i<items.length;i++){
      const item=items[i],subjectId=Number(item.subject_id)||byCode.get(clean(item.subject_code).toLowerCase()),title=clean(item.title),resourceUrl=clean(item.resource_url||item.url),mirror1=clean(item.mirror_url_1),mirror2=clean(item.mirror_url_2),expires=normalizeDate(item.expires_at);
      if(!subjectId||!validIds.has(Number(subjectId)))throw statusError(400,`السطر ${i+1}: المادة غير موجودة`);if(!title)throw statusError(400,`السطر ${i+1}: العنوان مطلوب`);if(!validateExternalUrl(resourceUrl)||!optionalUrl(mirror1)||!optionalUrl(mirror2))throw statusError(400,`السطر ${i+1}: يوجد رابط غير صالح`);if(item.expires_at&&!expires)throw statusError(400,`السطر ${i+1}: تاريخ الانتهاء غير صالح`);
      statements.push(e.DB.prepare('INSERT INTO resources(subject_id,title,description,resource_url,mirror_url_1,mirror_url_2,type,provider,link_status,content_type,lecture_name,tags,file_size,status,pinned,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(subjectId,title,clean(item.description),resourceUrl,mirror1||null,mirror2||null,clean(item.type)||'PDF',detectProvider(resourceUrl),'unknown',clean(item.content_type)||'lectures',clean(item.lecture_name),cleanTags(item.tags),Math.max(0,Number(item.file_size)||0),item.status==='hidden'?'hidden':'published',item.pinned?1:0,expires));imported++;
    }
    await e.DB.batch(statements);await audit(e,a,'bulk-import','resource','',`items:${imported}`,requestId);return json({ok:true,imported},201);
  }
  if(path==='/admin/backup'&&method==='GET'){
    requireRole(a,'admin');
    const [subjects,resources,announcements,settings]=await Promise.all([list(e,'SELECT * FROM subjects ORDER BY id'),list(e,'SELECT * FROM resources ORDER BY id'),list(e,'SELECT * FROM announcements ORDER BY id'),list(e,'SELECT * FROM settings ORDER BY key')]);
    return json({version:VERSION,edition:'no-r2',exportedAt:new Date().toISOString(),subjects,resources,announcements,settings});
  }
  if(path==='/admin/restore'&&method==='POST'){
    requireRole(a,'admin');const x=await body(r);if(!Array.isArray(x.subjects)||!Array.isArray(x.resources)||!Array.isArray(x.announcements)||!Array.isArray(x.settings))throw statusError(400,'ملف النسخة الاحتياطية غير صالح');
    const total=x.subjects.length+x.resources.length+x.announcements.length+x.settings.length;if(total>10000)throw statusError(413,'النسخة الاحتياطية كبيرة جداً لهذه العملية');
    const subjectIds=new Set(x.subjects.map(item=>Number(item.id)));
    for(const item of x.resources){const resourceUrl=item.resource_url||item.file_url;if(!validateExternalUrl(resourceUrl)||!optionalUrl(item.mirror_url_1)||!optionalUrl(item.mirror_url_2))throw statusError(400,`النسخة تحتوي رابطاً غير آمن: ${clean(item.title)||'بدون عنوان'}`);if(!subjectIds.has(Number(item.subject_id)))throw statusError(400,`النسخة تحتوي ملفاً مرتبطاً بمادة غير موجودة: ${clean(item.title)||'بدون عنوان'}`)}
    const statements=[e.DB.prepare('DELETE FROM resources'),e.DB.prepare('DELETE FROM announcements'),e.DB.prepare('DELETE FROM subjects'),e.DB.prepare('DELETE FROM settings')];
    for(const item of x.subjects)statements.push(e.DB.prepare('INSERT INTO subjects(id,name,code,department,academic_year,study_level,semester,status,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP),COALESCE(?,CURRENT_TIMESTAMP),?)').bind(item.id,item.name,item.code,item.department||'Business',item.academic_year||'',item.study_level||item.level||'',item.semester||'',item.status||'published',item.created_at||null,item.updated_at||null,item.deleted_at||null));
    for(const item of x.resources)statements.push(e.DB.prepare('INSERT INTO resources(id,subject_id,title,description,resource_url,mirror_url_1,mirror_url_2,type,provider,link_status,last_checked_at,content_type,lecture_name,tags,file_size,status,pinned,expires_at,downloads,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP),COALESCE(?,CURRENT_TIMESTAMP),?)').bind(item.id,item.subject_id,item.title,item.description||'',item.resource_url||item.file_url,item.mirror_url_1||null,item.mirror_url_2||null,item.type||'PDF',item.provider||detectProvider(item.resource_url||item.file_url),item.link_status||'unknown',item.last_checked_at||null,item.content_type||'lectures',item.lecture_name||'',cleanTags(item.tags),Math.max(0,Number(item.file_size||item.size)||0),item.status||'published',item.pinned?1:0,normalizeDate(item.expires_at),Math.max(0,Number(item.downloads)||0),item.created_at||null,item.updated_at||null,item.deleted_at||null));
    for(const item of x.announcements)statements.push(e.DB.prepare('INSERT INTO announcements(id,title,content,priority,status,pinned,starts_at,ends_at,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP),COALESCE(?,CURRENT_TIMESTAMP),?)').bind(item.id,item.title,item.content,item.priority||'normal',item.status||'published',item.pinned?1:0,normalizeDate(item.starts_at),normalizeDate(item.ends_at),item.created_at||null,item.updated_at||null,item.deleted_at||null));
    for(const item of x.settings)statements.push(e.DB.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(item.key,String(item.value??'')));
    for(const[k,v]of [['site_name','Business For All'],['site_description','منصة تعليمية عصرية لطلاب إدارة الأعمال'],['academic_year','2026/2027'],['hero_badge','منصة المواد الدراسية'],['footer_text','Business For All — كل المحتوى الأكاديمي في مكان واحد'],['maintenance_mode','0'],['maintenance_message','نجري بعض التحسينات الآن. ارجع بعد قليل.']])statements.push(e.DB.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').bind(k,v));
    await e.DB.batch(statements);await audit(e,a,'restore','backup','',`items:${total}`,requestId);return json({ok:true,restored:total});
  }
  if(path==='/admin/subject'&&method==='POST'){
    requireRole(a,'editor');const x=await body(r),name=clean(x.name),code=clean(x.code);if(!name||!code)throw statusError(400,'الاسم والكود مطلوبان');
    const q=await e.DB.prepare('INSERT INTO subjects(name,code,department,academic_year,study_level,semester,status) VALUES(?,?,?,?,?,?,?)').bind(name,code,clean(x.department)||'Business',clean(x.academic_year),clean(x.study_level),clean(x.semester),x.status==='hidden'?'hidden':'published').run();
    await audit(e,a,'create','subject',q.meta.last_row_id,name,requestId);return json({ok:true,id:q.meta.last_row_id},201);
  }
  m=path.match(/^\/admin\/subject\/(\d+)$/);
  if(m&&method==='PUT'){
    requireRole(a,'editor');const x=await body(r),name=clean(x.name),code=clean(x.code);if(!name||!code)throw statusError(400,'الاسم والكود مطلوبان');
    const result=await e.DB.prepare('UPDATE subjects SET name=?,code=?,department=?,academic_year=?,study_level=?,semester=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL').bind(name,code,clean(x.department)||'Business',clean(x.academic_year),clean(x.study_level),clean(x.semester),x.status==='hidden'?'hidden':'published',+m[1]).run();
    if(!result.meta.changes)throw statusError(404,'المادة غير موجودة');await audit(e,a,'update','subject',m[1],name,requestId);return json({ok:true});
  }
  if(m&&method==='DELETE'){
    requireRole(a,'editor');const id=+m[1],stamp=new Date().toISOString().replace('T',' ').slice(0,19);const subject=await e.DB.prepare('SELECT id FROM subjects WHERE id=? AND deleted_at IS NULL').bind(id).first();if(!subject)throw statusError(404,'المادة غير موجودة');await e.DB.batch([e.DB.prepare('UPDATE subjects SET deleted_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(stamp,id),e.DB.prepare('UPDATE resources SET deleted_at=?,updated_at=CURRENT_TIMESTAMP WHERE subject_id=? AND deleted_at IS NULL').bind(stamp,id)]);await audit(e,a,'trash','subject',id,'with-active-resources',requestId);return json({ok:true});
  }
  if(path==='/admin/resource'&&method==='POST'){
    requireRole(a,'editor');const x=resourcePayload(await body(r));if(!x.subjectId||!x.title)throw statusError(400,'المادة والعنوان مطلوبان');
    const subject=await e.DB.prepare('SELECT id FROM subjects WHERE id=? AND deleted_at IS NULL').bind(x.subjectId).first();if(!subject)throw statusError(400,'المادة المحددة غير موجودة');
    const q=await e.DB.prepare('INSERT INTO resources(subject_id,title,description,resource_url,mirror_url_1,mirror_url_2,type,provider,link_status,content_type,lecture_name,tags,file_size,status,pinned,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(x.subjectId,x.title,x.description,x.resourceUrl,x.mirror1,x.mirror2,x.type,x.provider,'unknown',x.contentType,x.lectureName,x.tags,x.fileSize,x.status,x.pinned,x.expires).run();
    await audit(e,a,'create','resource',q.meta.last_row_id,x.title,requestId);return json({ok:true,id:q.meta.last_row_id},201);
  }
  m=path.match(/^\/admin\/resource\/(\d+)$/);
  if(m&&method==='PUT'){
    requireRole(a,'editor');const x=resourcePayload(await body(r));if(!x.subjectId||!x.title)throw statusError(400,'المادة والعنوان مطلوبان');
    const subject=await e.DB.prepare('SELECT id FROM subjects WHERE id=? AND deleted_at IS NULL').bind(x.subjectId).first();if(!subject)throw statusError(400,'المادة المحددة غير موجودة');
    const result=await e.DB.prepare("UPDATE resources SET subject_id=?,title=?,description=?,resource_url=?,mirror_url_1=?,mirror_url_2=?,type=?,provider=?,link_status=CASE WHEN resource_url<>? THEN 'unknown' ELSE link_status END,content_type=?,lecture_name=?,tags=?,file_size=?,status=?,pinned=?,expires_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL").bind(x.subjectId,x.title,x.description,x.resourceUrl,x.mirror1,x.mirror2,x.type,x.provider,x.resourceUrl,x.contentType,x.lectureName,x.tags,x.fileSize,x.status,x.pinned,x.expires,+m[1]).run();
    if(!result.meta.changes)throw statusError(404,'الملف غير موجود');await audit(e,a,'update','resource',m[1],x.title,requestId);return json({ok:true});
  }
  if(m&&method==='DELETE'){
    requireRole(a,'editor');const result=await e.DB.prepare('UPDATE resources SET deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL').bind(+m[1]).run();if(!result.meta.changes)throw statusError(404,'الملف غير موجود');await audit(e,a,'trash','resource',m[1],'',requestId);return json({ok:true});
  }
  if(path==='/admin/announcement'&&method==='POST'){
    requireRole(a,'editor');const x=await body(r),title=clean(x.title),content=clean(x.content);if(!title||!content)throw statusError(400,'العنوان والمحتوى مطلوبان');
    const starts=normalizeDate(x.starts_at),ends=normalizeDate(x.ends_at);if(x.starts_at&&!starts||x.ends_at&&!ends)throw statusError(400,'تاريخ الإعلان غير صالح');if(starts&&ends&&starts>=ends)throw statusError(400,'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية');
    const q=await e.DB.prepare('INSERT INTO announcements(title,content,priority,status,pinned,starts_at,ends_at) VALUES(?,?,?,?,?,?,?)').bind(title,content,x.priority==='high'?'high':'normal',x.status==='hidden'?'hidden':'published',x.pinned?1:0,starts,ends).run();
    await audit(e,a,'create','announcement',q.meta.last_row_id,title,requestId);return json({ok:true,id:q.meta.last_row_id},201);
  }
  m=path.match(/^\/admin\/announcement\/(\d+)$/);
  if(m&&method==='PUT'){
    requireRole(a,'editor');const x=await body(r),title=clean(x.title),content=clean(x.content);if(!title||!content)throw statusError(400,'العنوان والمحتوى مطلوبان');
    const starts=normalizeDate(x.starts_at),ends=normalizeDate(x.ends_at);if(x.starts_at&&!starts||x.ends_at&&!ends)throw statusError(400,'تاريخ الإعلان غير صالح');if(starts&&ends&&starts>=ends)throw statusError(400,'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية');
    const result=await e.DB.prepare('UPDATE announcements SET title=?,content=?,priority=?,status=?,pinned=?,starts_at=?,ends_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL').bind(title,content,x.priority==='high'?'high':'normal',x.status==='hidden'?'hidden':'published',x.pinned?1:0,starts,ends,+m[1]).run();
    if(!result.meta.changes)throw statusError(404,'الإعلان غير موجود');await audit(e,a,'update','announcement',m[1],title,requestId);return json({ok:true});
  }
  if(m&&method==='DELETE'){
    requireRole(a,'editor');const result=await e.DB.prepare('UPDATE announcements SET deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL').bind(+m[1]).run();if(!result.meta.changes)throw statusError(404,'الإعلان غير موجود');await audit(e,a,'trash','announcement',m[1],'',requestId);return json({ok:true});
  }
  if(path==='/admin/trash'&&method==='GET'){
    requireRole(a,'admin');const [subjects,resources,announcements]=await Promise.all([list(e,'SELECT id,name title,code subtitle,deleted_at FROM subjects WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC'),list(e,'SELECT r.id,r.title,s.name subtitle,r.deleted_at FROM resources r LEFT JOIN subjects s ON s.id=r.subject_id WHERE r.deleted_at IS NOT NULL ORDER BY r.deleted_at DESC'),list(e,"SELECT id,title,'إعلان' subtitle,deleted_at FROM announcements WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC")]);return json({subjects,resources,announcements});
  }
  m=path.match(/^\/admin\/trash\/(subject|resource|announcement)\/(\d+)\/restore$/);
  if(m&&method==='POST'){
    requireRole(a,'admin');const type=m[1],id=+m[2];if(type==='subject'){const subject=await e.DB.prepare('SELECT id,deleted_at FROM subjects WHERE id=? AND deleted_at IS NOT NULL').bind(id).first();if(!subject)throw statusError(404,'العنصر غير موجود في سلة المحذوفات');await e.DB.batch([e.DB.prepare('UPDATE subjects SET deleted_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(id),e.DB.prepare('UPDATE resources SET deleted_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE subject_id=? AND deleted_at=?').bind(id,subject.deleted_at)]);}else{const table=type==='resource'?'resources':'announcements';if(type==='resource'){const resource=await e.DB.prepare('SELECT r.id,s.deleted_at subject_deleted FROM resources r JOIN subjects s ON s.id=r.subject_id WHERE r.id=? AND r.deleted_at IS NOT NULL').bind(id).first();if(!resource)throw statusError(404,'العنصر غير موجود في سلة المحذوفات');if(resource.subject_deleted)throw statusError(409,'استرجع المادة التابعة لهذا الملف أولاً');}const result=await e.DB.prepare(`UPDATE ${table} SET deleted_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NOT NULL`).bind(id).run();if(!result.meta.changes)throw statusError(404,'العنصر غير موجود في سلة المحذوفات');}await audit(e,a,'restore',type,id,'',requestId);return json({ok:true});
  }
  m=path.match(/^\/admin\/trash\/(subject|resource|announcement)\/(\d+)$/);
  if(m&&method==='DELETE'){
    requireRole(a,'admin');const table={subject:'subjects',resource:'resources',announcement:'announcements'}[m[1]];const result=await e.DB.prepare(`DELETE FROM ${table} WHERE id=? AND deleted_at IS NOT NULL`).bind(+m[2]).run();if(!result.meta.changes)throw statusError(404,'العنصر غير موجود في سلة المحذوفات');await audit(e,a,'delete-permanent',m[1],m[2],'',requestId);return json({ok:true});
  }
  if(path==='/admin/team'&&method==='GET'){
    requireRole(a,'owner');return json({items:await list(e,'SELECT id,name,email,role,status,created_at FROM admins ORDER BY CASE role WHEN \'owner\' THEN 0 WHEN \'admin\' THEN 1 ELSE 2 END,id')});
  }
  if(path==='/admin/team'&&method==='POST'){
    requireRole(a,'owner');const x=await body(r),name=clean(x.name),email=clean(x.email).toLowerCase(),password=String(x.password||''),role=x.role==='admin'?'admin':'editor';if(name.length<2||!validEmail(email)||password.length<10)throw statusError(400,'أكمل الاسم والبريد وكلمة مرور لا تقل عن 10 أحرف');const q=await e.DB.prepare('INSERT INTO admins(name,email,password_hash,role,status) VALUES(?,?,?,?,?)').bind(name,email,await passwordHash(password),role,x.status==='disabled'?'disabled':'active').run();await audit(e,a,'create','admin',q.meta.last_row_id,email,requestId);return json({ok:true,id:q.meta.last_row_id},201);
  }
  m=path.match(/^\/admin\/team\/(\d+)$/);
  if(m&&method==='PATCH'){
    requireRole(a,'owner');const id=+m[1],target=await e.DB.prepare('SELECT id,role FROM admins WHERE id=?').bind(id).first();if(!target)throw statusError(404,'المستخدم غير موجود');if(target.role==='owner'||id===a.id)throw statusError(400,'لا يمكن تعديل حساب المالك من هنا');const x=await body(r),role=x.role==='admin'?'admin':'editor',status=x.status==='disabled'?'disabled':'active';await e.DB.prepare('UPDATE admins SET role=?,status=? WHERE id=?').bind(role,status,id).run();if(status==='disabled')await e.DB.prepare('DELETE FROM sessions WHERE admin_id=?').bind(id).run();await audit(e,a,'update','admin',id,`${role}:${status}`,requestId);return json({ok:true});
  }
  if(path==='/admin/settings'&&method==='PUT'){
    requireRole(a,'admin');const x=await body(r),allowed=['site_name','site_description','academic_year','hero_badge','footer_text','maintenance_mode','maintenance_message'];
    for(const key of allowed)if(Object.hasOwn(x,key)){let value=String(x[key]??'');if(key==='maintenance_mode')value=x[key]===true||x[key]===1||x[key]==='1'?'1':'0';await e.DB.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(key,value).run()}
    await audit(e,a,'settings','settings','','',requestId);return json({ok:true});
  }
  if(path==='/admin/password'&&method==='PUT'){
    const x=await body(r),full=await e.DB.prepare('SELECT * FROM admins WHERE id=?').bind(a.id).first();if(!await verifyPassword(String(x.current||''),full.password_hash))throw statusError(400,'كلمة المرور الحالية غير صحيحة');if(String(x.next||'').length<10)throw statusError(400,'كلمة المرور الجديدة يجب ألا تقل عن 10 أحرف');if(String(x.current||'')===String(x.next||''))throw statusError(400,'استخدم كلمة مرور جديدة مختلفة');
    await e.DB.prepare('UPDATE admins SET password_hash=?,failed_attempts=0,locked_until=NULL WHERE id=?').bind(await passwordHash(x.next),a.id).run();await e.DB.prepare('DELETE FROM sessions WHERE admin_id=?').bind(a.id).run();await audit(e,a,'password','security','','',requestId);
    return json({ok:true,message:'تم تغيير كلمة المرور وإنهاء جميع الجلسات. سجل الدخول من جديد.'},200,{'set-cookie':sessionCookie(r,'',0)});
  }
  if(path==='/admin/sessions/revoke'&&method==='POST'){
    await e.DB.prepare('DELETE FROM sessions WHERE admin_id=?').bind(a.id).run();await audit(e,a,'logout','security','','revoke-all',requestId);return json({ok:true},200,{'set-cookie':sessionCookie(r,'',0)});
  }
  throw statusError(404,'المسار غير موجود');
}

function mapUnknownError(error){
  const msg=String(error?.message||error||'');
  if(/UNIQUE constraint failed: subjects\.code/i.test(msg))return statusError(409,'كود المادة مستخدم بالفعل');
  if(/UNIQUE constraint failed: admins\.email/i.test(msg))return statusError(409,'البريد الإلكتروني مستخدم بالفعل');
  if(/FOREIGN KEY constraint failed/i.test(msg))return statusError(400,'البيانات مرتبطة بعناصر أخرى أو المرجع غير صالح');
  return error;
}
export default{
  async fetch(r,e){
    const u=new URL(r.url),requestId=crypto.randomUUID();
    try{return u.pathname.startsWith('/api/')?await handle(r,e,u.pathname.slice(4),requestId):e.ASSETS.fetch(r)}
    catch(raw){const x=mapUnknownError(raw);console.error('Request failed',requestId,x);const known=Boolean(x.status);return json({error:known?x.message:'تعذر تنفيذ الطلب بسبب خطأ داخلي',requestId,hint:known?undefined:'استخدم Request ID في Workers Logs إذا استمر الخطأ.',...(!known&&e.APP_ENV==='development'?{diagnostic:String(x.message||x).slice(0,240)}:{})},x.status||500)}
  },
  async scheduled(event,e,ctx){ctx.waitUntil((async()=>{await schema(e);await e.DB.prepare("DELETE FROM sessions WHERE expires_at<=datetime('now')").run()})())}
};
