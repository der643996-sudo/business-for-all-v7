const VERSION='7.1.0';
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
function detectProvider(value){
  try{const host=new URL(value).hostname.toLowerCase();if(host.includes('drive.google.com'))return'google-drive';if(host.includes('docs.google.com'))return'google-docs';if(host.includes('onedrive.live.com')||host.includes('1drv.ms'))return'onedrive';if(host.includes('dropbox.com'))return'dropbox';return host}catch{return'external'}
}
async function list(e,sql,...args){const st=e.DB.prepare(sql);return(await(args.length?st.bind(...args):st).all()).results||[]}
let ready;
async function schema(env){
  if(!env.DB||typeof env.DB.prepare!=='function')throw statusError(503,'D1 binding DB غير موجود. شغّل START-FRESH-DATABASE.bat لإنشاء قاعدة جديدة وربطها باسم DB.');
  if(ready)return ready;
  ready=(async()=>{
    const statements=[
      "PRAGMA foreign_keys=ON",
      "CREATE TABLE IF NOT EXISTS admins(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'owner' CHECK(role IN('owner','admin','editor')),status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','disabled')),failed_attempts INTEGER NOT NULL DEFAULT 0,locked_until TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,expires_at TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS subjects(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,code TEXT NOT NULL UNIQUE,department TEXT NOT NULL DEFAULT 'Business',academic_year TEXT NOT NULL DEFAULT '',study_level TEXT NOT NULL DEFAULT '',semester TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'published' CHECK(status IN('published','hidden')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS resources(id INTEGER PRIMARY KEY AUTOINCREMENT,subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',resource_url TEXT NOT NULL,type TEXT NOT NULL DEFAULT 'PDF',provider TEXT NOT NULL DEFAULT 'external',link_status TEXT NOT NULL DEFAULT 'unknown',last_checked_at TEXT,content_type TEXT NOT NULL DEFAULT 'lectures',lecture_name TEXT NOT NULL DEFAULT '',file_size INTEGER NOT NULL DEFAULT 0 CHECK(file_size>=0),status TEXT NOT NULL DEFAULT 'published' CHECK(status IN('published','hidden')),downloads INTEGER NOT NULL DEFAULT 0 CHECK(downloads>=0),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS announcements(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,content TEXT NOT NULL,priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN('normal','high')),status TEXT NOT NULL DEFAULT 'published' CHECK(status IN('published','hidden')),pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN(0,1)),starts_at TEXT,ends_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,action TEXT NOT NULL,entity TEXT NOT NULL,entity_id TEXT,details TEXT,request_id TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      "CREATE INDEX IF NOT EXISTS idx_subjects_taxonomy ON subjects(study_level,semester,department,academic_year,status)",
      "CREATE INDEX IF NOT EXISTS idx_resources_subject ON resources(subject_id,status,created_at DESC)",
      "CREATE INDEX IF NOT EXISTS idx_resources_search ON resources(content_type,type,status,created_at DESC)",
      "CREATE INDEX IF NOT EXISTS idx_resources_downloads ON resources(downloads DESC)",
      "CREATE INDEX IF NOT EXISTS idx_announcements_schedule ON announcements(status,pinned,starts_at,ends_at)",
      "CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at)",
      "CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC)"
    ];
    for(const sql of statements)await env.DB.prepare(sql).run();
    const seeds=[
      ['site_name','Business For All'],['site_description','منصة تعليمية عصرية لطلاب إدارة الأعمال'],['academic_year','2026/2027'],
      ['hero_badge','منصة المواد الدراسية'],['footer_text','Business For All — كل المحتوى الأكاديمي في مكان واحد']
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
async function audit(e,a,action,entity,id='',details='',requestId=null){await e.DB.prepare('INSERT INTO audit_logs(admin_id,action,entity,entity_id,details,request_id) VALUES(?,?,?,?,?,?)').bind(a?.id||null,action,entity,String(id||''),clean(details),requestId).run()}

async function handle(r,e,path,requestId){
  const method=r.method,url=new URL(r.url);
  if(path==='/health'){
    if(!e.DB||typeof e.DB.prepare!=='function')return json({ok:false,version:VERSION,stage:'binding',error:'D1 binding DB غير موجود'},503);
    try{const check=await e.DB.prepare("SELECT datetime('now') AS now").first();return json({ok:true,version:VERSION,stage:'connection',database:'D1',databaseTime:check.now,storage:'external-links'})}
    catch(error){return json({ok:false,version:VERSION,stage:'connection',error:'تعذر الاتصال بقاعدة D1',diagnostic:e.APP_ENV==='development'?String(error.message||error).slice(0,240):undefined},503)}
  }
  await schema(e);
  if(path==='/diagnostics'){
    const tables=await list(e,"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'d1_migrations' ORDER BY name");
    return json({ok:true,version:VERSION,binding:'DB',tables:tables.map(x=>x.name)});
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
    const q=clean(url.searchParams.get('q')),level=clean(url.searchParams.get('level')),semester=clean(url.searchParams.get('semester')),department=clean(url.searchParams.get('department')),year=clean(url.searchParams.get('year')),contentType=clean(url.searchParams.get('content_type')),sort=clean(url.searchParams.get('sort'))||'newest',pattern=`%${q}%`;
    const order=sort==='downloads'?'r.downloads DESC':sort==='name'?'r.title COLLATE NOCASE ASC':sort==='size'?'r.file_size DESC':'r.created_at DESC';
    const subjectSql="SELECT * FROM subjects WHERE status='published' AND (?='' OR study_level=?) AND (?='' OR semester=?) AND (?='' OR department=?) AND (?='' OR academic_year=?) ORDER BY name COLLATE NOCASE";
    const resourceSql=`SELECT r.*,s.name subject_name,s.code subject_code,s.study_level,s.semester,s.department,s.academic_year FROM resources r JOIN subjects s ON s.id=r.subject_id WHERE r.status='published' AND s.status='published' AND (?='' OR s.study_level=?) AND (?='' OR s.semester=?) AND (?='' OR s.department=?) AND (?='' OR s.academic_year=?) AND (?='' OR r.content_type=?) AND (?='' OR r.title LIKE ? OR r.lecture_name LIKE ? OR r.description LIKE ? OR s.name LIKE ? OR s.code LIKE ?) ORDER BY ${order}`;
    const [settings,subjects,resources,announcements]=await Promise.all([
      list(e,'SELECT key,value FROM settings'),
      list(e,subjectSql,level,level,semester,semester,department,department,year,year),
      list(e,resourceSql,level,level,semester,semester,department,department,year,year,contentType,contentType,q,pattern,pattern,pattern,pattern,pattern),
      list(e,"SELECT * FROM announcements WHERE status='published' AND (starts_at IS NULL OR starts_at<=datetime('now')) AND (ends_at IS NULL OR ends_at>=datetime('now')) ORDER BY pinned DESC,CASE priority WHEN 'high' THEN 0 ELSE 1 END,created_at DESC LIMIT 20")
    ]);
    const safeResources=resources.filter(item=>validateExternalUrl(item.resource_url));return json({settings:Object.fromEntries(settings.map(x=>[x.key,x.value])),subjects,resources:safeResources,announcements,filters:{level,semester,department,year,contentType,sort}},200,{'cache-control':'public,max-age=15,s-maxage=45'});
  }
  let m=path.match(/^\/resource\/(\d+)$/);
  if(m&&method==='GET'){
    const f=await e.DB.prepare("SELECT * FROM resources WHERE id=? AND status='published'").bind(+m[1]).first();if(!f)throw statusError(404,'الرابط غير موجود');if(!validateExternalUrl(f.resource_url))throw statusError(400,'رابط الملف غير آمن أو يحتاج إلى تحديث');
    await e.DB.prepare('UPDATE resources SET downloads=downloads+1 WHERE id=?').bind(f.id).run();
    return Response.redirect(f.resource_url,302);
  }

  const a=await requireAdmin(r,e);
  if(path==='/admin/dashboard'&&method==='GET'){
    const [subjects,resources,announcements,logs]=await Promise.all([
      list(e,'SELECT * FROM subjects ORDER BY id DESC'),
      list(e,'SELECT r.*,s.name subject_name,s.code subject_code FROM resources r JOIN subjects s ON s.id=r.subject_id ORDER BY r.id DESC'),
      list(e,'SELECT * FROM announcements ORDER BY pinned DESC,id DESC'),
      list(e,'SELECT l.*,a.name admin_name FROM audit_logs l LEFT JOIN admins a ON a.id=l.admin_id ORDER BY l.id DESC LIMIT 50')
    ]);
    return json({subjects,resources,announcements,logs,version:VERSION});
  }
  if(path==='/admin/subjects'&&method==='GET'){
    const page=Math.max(1,Number(url.searchParams.get('page')||1)),limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit')||20))),q=clean(url.searchParams.get('q')),offset=(page-1)*limit,pattern=`%${q}%`;
    const [items,total]=await Promise.all([list(e,'SELECT * FROM subjects WHERE name LIKE ? OR code LIKE ? OR department LIKE ? OR study_level LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?',pattern,pattern,pattern,pattern,limit,offset),e.DB.prepare('SELECT COUNT(*) total FROM subjects WHERE name LIKE ? OR code LIKE ? OR department LIKE ? OR study_level LIKE ?').bind(pattern,pattern,pattern,pattern).first()]);
    return json({items,page,limit,total:total.total,pages:Math.max(1,Math.ceil(total.total/limit))});
  }
  if(path==='/admin/resources'&&method==='GET'){
    const page=Math.max(1,Number(url.searchParams.get('page')||1)),limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit')||20))),q=clean(url.searchParams.get('q')),offset=(page-1)*limit,pattern=`%${q}%`;
    const [items,total]=await Promise.all([list(e,'SELECT r.*,s.name subject_name FROM resources r JOIN subjects s ON s.id=r.subject_id WHERE r.title LIKE ? OR r.lecture_name LIKE ? OR s.name LIKE ? ORDER BY r.created_at DESC LIMIT ? OFFSET ?',pattern,pattern,pattern,limit,offset),e.DB.prepare('SELECT COUNT(*) total FROM resources r JOIN subjects s ON s.id=r.subject_id WHERE r.title LIKE ? OR r.lecture_name LIKE ? OR s.name LIKE ?').bind(pattern,pattern,pattern).first()]);
    return json({items,page,limit,total:total.total,pages:Math.max(1,Math.ceil(total.total/limit))});
  }
  if(path==='/admin/link-check'&&method==='POST'){
    const x=await body(r),id=Number(x.id),resource=await e.DB.prepare('SELECT * FROM resources WHERE id=?').bind(id).first();if(!resource)throw statusError(404,'الرابط غير موجود');if(!validateExternalUrl(resource.resource_url))throw statusError(400,'الرابط غير آمن للفحص. عدّله إلى رابط HTTPS عام.');
    let linkStatus='error',httpStatus=0;
    try{
      let response=await fetch(resource.resource_url,{method:'HEAD',redirect:'follow',signal:AbortSignal.timeout(7000)});
      if(response.status===405)response=await fetch(resource.resource_url,{method:'GET',headers:{Range:'bytes=0-0'},redirect:'follow',signal:AbortSignal.timeout(7000)});
      httpStatus=response.status;linkStatus=response.ok||[206,301,302,303,307,308].includes(response.status)?'ok':'error';
    }catch{}
    await e.DB.prepare('UPDATE resources SET link_status=?,last_checked_at=CURRENT_TIMESTAMP WHERE id=?').bind(linkStatus,id).run();
    await audit(e,a,'check','resource',id,`${linkStatus}:${httpStatus}`,requestId);return json({ok:linkStatus==='ok',linkStatus,httpStatus});
  }
  if(path==='/admin/backup'&&method==='GET'){
    const [subjects,resources,announcements,settings]=await Promise.all([list(e,'SELECT * FROM subjects ORDER BY id'),list(e,'SELECT * FROM resources ORDER BY id'),list(e,'SELECT * FROM announcements ORDER BY id'),list(e,'SELECT * FROM settings ORDER BY key')]);
    return json({version:VERSION,exportedAt:new Date().toISOString(),subjects,resources,announcements,settings});
  }
  if(path==='/admin/restore'&&method==='POST'){
    const x=await body(r);if(!Array.isArray(x.subjects)||!Array.isArray(x.resources)||!Array.isArray(x.announcements)||!Array.isArray(x.settings))throw statusError(400,'ملف النسخة الاحتياطية غير صالح');
    const total=x.subjects.length+x.resources.length+x.announcements.length+x.settings.length;if(total>10000)throw statusError(413,'النسخة الاحتياطية كبيرة جداً لهذه العملية');
    const subjectIds=new Set(x.subjects.map(item=>Number(item.id)));
    for(const item of x.resources){const resourceUrl=item.resource_url||item.file_url;if(!validateExternalUrl(resourceUrl))throw statusError(400,`النسخة تحتوي رابط ملف غير آمن: ${clean(item.title)||'بدون عنوان'}`);if(!subjectIds.has(Number(item.subject_id)))throw statusError(400,`النسخة تحتوي ملفاً مرتبطاً بمادة غير موجودة: ${clean(item.title)||'بدون عنوان'}`)}
    const statements=[e.DB.prepare('DELETE FROM resources'),e.DB.prepare('DELETE FROM announcements'),e.DB.prepare('DELETE FROM subjects'),e.DB.prepare('DELETE FROM settings')];
    for(const item of x.subjects)statements.push(e.DB.prepare('INSERT INTO subjects(id,name,code,department,academic_year,study_level,semester,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP),COALESCE(?,CURRENT_TIMESTAMP))').bind(item.id,item.name,item.code,item.department||'Business',item.academic_year||'',item.study_level||item.level||'',item.semester||'',item.status||'published',item.created_at||null,item.updated_at||null));
    for(const item of x.resources)statements.push(e.DB.prepare('INSERT INTO resources(id,subject_id,title,description,resource_url,type,provider,link_status,last_checked_at,content_type,lecture_name,file_size,status,downloads,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP),COALESCE(?,CURRENT_TIMESTAMP))').bind(item.id,item.subject_id,item.title,item.description||'',item.resource_url||item.file_url,item.type||'PDF',item.provider||detectProvider(item.resource_url||item.file_url),item.link_status||'unknown',item.last_checked_at||null,item.content_type||'lectures',item.lecture_name||'',Math.max(0,Number(item.file_size||item.size)||0),item.status||'published',Math.max(0,Number(item.downloads)||0),item.created_at||null,item.updated_at||null));
    for(const item of x.announcements)statements.push(e.DB.prepare('INSERT INTO announcements(id,title,content,priority,status,pinned,starts_at,ends_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP),COALESCE(?,CURRENT_TIMESTAMP))').bind(item.id,item.title,item.content,item.priority||'normal',item.status||'published',item.pinned?1:0,normalizeDate(item.starts_at),normalizeDate(item.ends_at),item.created_at||null,item.updated_at||null));
    for(const item of x.settings)statements.push(e.DB.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(item.key,String(item.value??'')));
    for(const[k,v]of [['site_name','Business For All'],['site_description','منصة تعليمية عصرية لطلاب إدارة الأعمال'],['academic_year','2026/2027'],['hero_badge','منصة المواد الدراسية'],['footer_text','Business For All — كل المحتوى الأكاديمي في مكان واحد']])statements.push(e.DB.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').bind(k,v));
    await e.DB.batch(statements);await audit(e,a,'restore','backup','',`items:${total}`,requestId);return json({ok:true,restored:total});
  }
  if(path==='/admin/subject'&&method==='POST'){
    const x=await body(r),name=clean(x.name),code=clean(x.code);if(!name||!code)throw statusError(400,'الاسم والكود مطلوبان');
    const q=await e.DB.prepare('INSERT INTO subjects(name,code,department,academic_year,study_level,semester,status) VALUES(?,?,?,?,?,?,?)').bind(name,code,clean(x.department)||'Business',clean(x.academic_year),clean(x.study_level),clean(x.semester),x.status==='hidden'?'hidden':'published').run();
    await audit(e,a,'create','subject',q.meta.last_row_id,name,requestId);return json({ok:true,id:q.meta.last_row_id},201);
  }
  m=path.match(/^\/admin\/subject\/(\d+)$/);
  if(m&&method==='PUT'){
    const x=await body(r),name=clean(x.name),code=clean(x.code);if(!name||!code)throw statusError(400,'الاسم والكود مطلوبان');
    const result=await e.DB.prepare('UPDATE subjects SET name=?,code=?,department=?,academic_year=?,study_level=?,semester=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(name,code,clean(x.department)||'Business',clean(x.academic_year),clean(x.study_level),clean(x.semester),x.status==='hidden'?'hidden':'published',+m[1]).run();
    if(!result.meta.changes)throw statusError(404,'المادة غير موجودة');await audit(e,a,'update','subject',m[1],name,requestId);return json({ok:true});
  }
  if(m&&method==='DELETE'){
    const result=await e.DB.prepare('DELETE FROM subjects WHERE id=?').bind(+m[1]).run();if(!result.meta.changes)throw statusError(404,'المادة غير موجودة');await audit(e,a,'delete','subject',m[1],'',requestId);return json({ok:true});
  }
  if(path==='/admin/resource'&&method==='POST'){
    const x=await body(r),subjectId=Number(x.subject_id),title=clean(x.title),resourceUrl=clean(x.resource_url);if(!subjectId||!title||!validateExternalUrl(resourceUrl))throw statusError(400,'أكمل البيانات وأدخل رابط HTTPS صالحاً');
    const subject=await e.DB.prepare('SELECT id FROM subjects WHERE id=?').bind(subjectId).first();if(!subject)throw statusError(400,'المادة المحددة غير موجودة');
    const q=await e.DB.prepare('INSERT INTO resources(subject_id,title,description,resource_url,type,provider,link_status,content_type,lecture_name,file_size,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(subjectId,title,clean(x.description),resourceUrl,clean(x.type)||'PDF',detectProvider(resourceUrl),'unknown',clean(x.content_type)||'lectures',clean(x.lecture_name),Math.max(0,Number(x.file_size)||0),x.status==='hidden'?'hidden':'published').run();
    await audit(e,a,'create','resource',q.meta.last_row_id,title,requestId);return json({ok:true,id:q.meta.last_row_id},201);
  }
  m=path.match(/^\/admin\/resource\/(\d+)$/);
  if(m&&method==='PUT'){
    const x=await body(r),subjectId=Number(x.subject_id),title=clean(x.title),resourceUrl=clean(x.resource_url);if(!subjectId||!title||!validateExternalUrl(resourceUrl))throw statusError(400,'أكمل البيانات وأدخل رابط HTTPS صالحاً');
    const result=await e.DB.prepare("UPDATE resources SET subject_id=?,title=?,description=?,resource_url=?,type=?,provider=?,link_status=CASE WHEN resource_url<>? THEN 'unknown' ELSE link_status END,content_type=?,lecture_name=?,file_size=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(subjectId,title,clean(x.description),resourceUrl,clean(x.type)||'PDF',detectProvider(resourceUrl),resourceUrl,clean(x.content_type)||'lectures',clean(x.lecture_name),Math.max(0,Number(x.file_size)||0),x.status==='hidden'?'hidden':'published',+m[1]).run();
    if(!result.meta.changes)throw statusError(404,'الملف غير موجود');await audit(e,a,'update','resource',m[1],title,requestId);return json({ok:true});
  }
  if(m&&method==='DELETE'){
    const result=await e.DB.prepare('DELETE FROM resources WHERE id=?').bind(+m[1]).run();if(!result.meta.changes)throw statusError(404,'الملف غير موجود');await audit(e,a,'delete','resource',m[1],'',requestId);return json({ok:true});
  }
  if(path==='/admin/announcement'&&method==='POST'){
    const x=await body(r),title=clean(x.title),content=clean(x.content);if(!title||!content)throw statusError(400,'العنوان والمحتوى مطلوبان');
    const starts=normalizeDate(x.starts_at),ends=normalizeDate(x.ends_at);if(x.starts_at&&!starts||x.ends_at&&!ends)throw statusError(400,'تاريخ الإعلان غير صالح');if(starts&&ends&&starts>=ends)throw statusError(400,'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية');
    const q=await e.DB.prepare('INSERT INTO announcements(title,content,priority,status,pinned,starts_at,ends_at) VALUES(?,?,?,?,?,?,?)').bind(title,content,x.priority==='high'?'high':'normal',x.status==='hidden'?'hidden':'published',x.pinned?1:0,starts,ends).run();
    await audit(e,a,'create','announcement',q.meta.last_row_id,title,requestId);return json({ok:true,id:q.meta.last_row_id},201);
  }
  m=path.match(/^\/admin\/announcement\/(\d+)$/);
  if(m&&method==='PUT'){
    const x=await body(r),title=clean(x.title),content=clean(x.content);if(!title||!content)throw statusError(400,'العنوان والمحتوى مطلوبان');
    const starts=normalizeDate(x.starts_at),ends=normalizeDate(x.ends_at);if(x.starts_at&&!starts||x.ends_at&&!ends)throw statusError(400,'تاريخ الإعلان غير صالح');if(starts&&ends&&starts>=ends)throw statusError(400,'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية');
    const result=await e.DB.prepare('UPDATE announcements SET title=?,content=?,priority=?,status=?,pinned=?,starts_at=?,ends_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(title,content,x.priority==='high'?'high':'normal',x.status==='hidden'?'hidden':'published',x.pinned?1:0,starts,ends,+m[1]).run();
    if(!result.meta.changes)throw statusError(404,'الإعلان غير موجود');await audit(e,a,'update','announcement',m[1],title,requestId);return json({ok:true});
  }
  if(m&&method==='DELETE'){
    const result=await e.DB.prepare('DELETE FROM announcements WHERE id=?').bind(+m[1]).run();if(!result.meta.changes)throw statusError(404,'الإعلان غير موجود');await audit(e,a,'delete','announcement',m[1],'',requestId);return json({ok:true});
  }
  if(path==='/admin/settings'&&method==='PUT'){
    const x=await body(r),allowed=['site_name','site_description','academic_year','hero_badge','footer_text'];
    for(const key of allowed)if(Object.hasOwn(x,key))await e.DB.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(key,String(x[key]??'')).run();
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
