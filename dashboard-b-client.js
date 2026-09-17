/* Operations console: honest observations, independent transport and source health. */
(function () {
  'use strict';
  const C = window.OpsCore, $ = id => document.getElementById(id);
  const copy = {
    en: {skip:'Skip to observations',eyebrow:'Portugal / Environmental monitoring',refresh:'Refresh',conditions:'Current conditions',lastValues:'Last received values · select to inspect',spatial:'Spatial context',atlas:'Reported positions',atlasCaption:'Reported coordinates · north up · equal scale · position age shown',freshness:'System freshness',sources:'Observation sources',recent:'● Recent',delayed:'△ Delayed',silent:'× Silent',cadence:'Recent <90 min · delayed 90 min–3 h · silent ≥3 h',mesh:'Mesh communications',receiveOnly:'Receive only',messages:'Received messages',meshCaption:'Use a mesh radio to transmit. This console receives messages.',history:'Observation history',trends:'Environmental trends',window:'Time window',viewReadings:'View readings',chartCaption:'Time in Lisbon · raw samples · gaps over 90 minutes remain visible',footer:'Field observations support investigation; no hazard classification is configured.',simpleView:'Simple dashboard ↗',inspect:'Inspect observation',close:'Close',temp:'Air temperature',humidity:'Humidity',wind:'Wind speed',rain:'Rain intensity',soil:'Soil moisture',co2:'Carbon dioxide',pressure:'Pressure',light:'Illuminance',soilTemp:'Soil temperature',ec:'Soil conductivity',demo:'Demonstration',liveMode:'Live feed',connected:'● Browser connected',connecting:'○ Connecting',reconnecting:'△ Reconnecting',mqttOn:'● MQTT connected',mqttOff:'× MQTT disconnected',mqttDemo:'MQTT isolated',demoNotice:'Demonstration · synthetic observations and coordinates. No connection to the farm.',apiError:'Observation service unavailable. Last received values remain visible; retry with Refresh.',historyError:'History could not be refreshed. Showing the last available samples.',wsError:'Live connection lost. Polling observations every 30 seconds; reconnecting automatically.',unknown:'No reading',live:'Recent',stale:'Delayed',down:'Silent',never:'Never received',now:'Just received',ago:'ago',sourcesRecent:'sources recent',noSources:'No sensor uplinks received. Check the relay and MQTT connection in Diagnostics.',noPositions:'No coordinates received. Positioned mesh nodes will appear here when they report.',located:'located',unlocated:'without coordinates',selectNode:'Select a node to inspect its last reported position.',noMesh:'No mesh nodes received. Check the Meshtastic JSON feed in Diagnostics.',noMessages:'No messages received since the bridge started.',heard:'nodes heard',sample:'samples',noHistory:'No samples in this time window. Select another metric or check source freshness.',min:'Min',max:'Max',received:'Received',value:'Value',source:'Source',lastReceived:'Last received',positionReceived:'Position received',hops:'hops',externalPower:'External power',battery:'Battery',observations:'observations',waiting:'Waiting for observations',lisbon:'Lisbon',seen:'Last heard',noCoords:'No coordinates',raw:'Raw readings',snapshotOld:'The last service response is over 90 seconds old. Refresh or open Diagnostics.',inspectMore:'Additional observations',noPositionTime:'Position time unavailable',storageError:'Observation storage failed. Check disk space and database permissions in Diagnostics.'},
    zh: {skip:'跳转到观测数据',eyebrow:'葡萄牙 / 环境监测',refresh:'刷新',conditions:'当前环境',lastValues:'最近接收的读数 · 点击查看详情',spatial:'空间信息',atlas:'已上报位置',atlasCaption:'上报坐标 · 北向上 · 等比例 · 标注位置数据年龄',freshness:'数据新鲜度',sources:'观测来源',recent:'● 新近',delayed:'△ 延迟',silent:'× 静默',cadence:'新近 <90 分钟 · 延迟 90 分钟–3 小时 · 静默 ≥3 小时',mesh:'Mesh 通讯',receiveOnly:'仅接收',messages:'已接收消息',meshCaption:'请使用 Mesh 电台发送消息。本控制台仅接收消息。',history:'观测历史',trends:'环境趋势',window:'时间范围',viewReadings:'查看读数',chartCaption:'里斯本时间 · 原始采样 · 超过 90 分钟的空缺不连线',footer:'环境观测用于辅助排查；尚未配置灾害分类规则。',simpleView:'简版仪表盘 ↗',inspect:'查看观测详情',close:'关闭',temp:'空气温度',humidity:'湿度',wind:'风速',rain:'降雨强度',soil:'土壤水分',co2:'二氧化碳',pressure:'气压',light:'照度',soilTemp:'土壤温度',ec:'土壤电导率',demo:'演示模式',liveMode:'实时采集',connected:'● 浏览器已连接',connecting:'○ 正在连接',reconnecting:'△ 正在重连',mqttOn:'● MQTT 已连接',mqttOff:'× MQTT 已断开',mqttDemo:'MQTT 已隔离',demoNotice:'演示模式 · 观测值和坐标均为模拟数据，未连接农场。',apiError:'观测服务不可用。保留最近接收的读数；可点击刷新重试。',historyError:'历史数据刷新失败，正在显示上次获取的采样。',wsError:'实时连接已断开。每 30 秒轮询观测数据，并自动重连。',unknown:'无读数',live:'新近',stale:'延迟',down:'静默',never:'尚未接收',now:'刚刚接收',ago:'前',sourcesRecent:'个来源新近上报',noSources:'尚未收到传感器数据。请在诊断页检查中继和 MQTT 连接。',noPositions:'尚未收到坐标。Mesh 节点上报位置后将显示在这里。',located:'个有坐标',unlocated:'个无坐标',selectNode:'选择节点以查看最近上报的位置。',noMesh:'尚未收到 Mesh 节点。请在诊断页检查 Meshtastic JSON 数据流。',noMessages:'桥接服务启动后尚未收到消息。',heard:'个节点已上报',sample:'个采样',noHistory:'此时间范围内无采样。请选择其他指标或检查数据新鲜度。',min:'最低',max:'最高',received:'接收时间',value:'数值',source:'来源',lastReceived:'最近接收',positionReceived:'位置接收时间',hops:'跳',externalPower:'外接电源',battery:'电量',observations:'个观测值',waiting:'等待观测数据',lisbon:'里斯本',seen:'最近收到消息',noCoords:'无坐标',raw:'原始读数',snapshotOld:'观测服务已超过 90 秒未响应。请刷新或打开诊断页。',inspectMore:'其他观测',noPositionTime:'位置时间不可用',storageError:'观测数据存储失败。请检查磁盘空间和数据库权限。'}
  };
  let lang = 'en';
  try { if (localStorage.getItem('farm-lang') === 'zh') lang = 'zh'; } catch (_) {}
  const t = key => window.FarmUI?.label(key,lang) || copy[lang][key] || key;
  const esc = str => String(str ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const metrics = {
    'weather.temp':{name:'temp',unit:C.fieldUnits['air temperature'],digits:1}, 'weather.hum':{name:'humidity',unit:C.fieldUnits['humidity'],digits:0},
    'weather.wind':{name:'wind',unit:C.fieldUnits['wind speed'],digits:1}, 'weather.rain_rate':{name:'rain',unit:C.fieldUnits['rain intensity'],digits:1},
    'soil.hum':{name:'soil',unit:C.fieldUnits['soil moisture'],digits:1}, 'weather.co2':{name:'co2',unit:C.fieldUnits['co2'],digits:0},
    'weather.pressure':{name:'pressure',unit:'hPa',digits:1,scale:.01}, 'weather.light':{name:'light',unit:C.fieldUnits['light'],digits:0},
    'weather.pm25':{name:'PM2.5',unit:C.fieldUnits['pm2.5'],digits:1}, 'weather.pm10':{name:'PM10',unit:C.fieldUnits['pm10'],digits:1},
    'soil.temp':{name:'soilTemp',unit:C.fieldUnits['soil temperature'],digits:1}, 'soil.ec':{name:'ec',unit:C.fieldUnits['soil ec'],digits:2}
  };
  const primary = ['weather.temp','weather.wind','weather.rain_rate','soil.hum','weather.co2'];
  let state = {}, meta = {}, health = {lora:[],meshtastic:[]}, mesh = {nodes:[]}, server = {};
  let history = {}, chartKey = primary[0], hours = 24, selectedNode = null, detailKey = null;
  let receivedAt = 0, serverTime = 0, socketState = 'connecting', apiError = false, historyError = false, busy = false;
  let renderedMessages = '', historyEnd = 0;
  const now = () => serverTime ? serverTime + (performance.now() - receivedAt)/1000 : Date.now()/1000;
  const symbols = {live:'●',stale:'△',down:'×',unknown:'○'};
  const status = ts => C.status(ts, now(), health.thresholds);
  const format = (key,v) => C.finite(v) ? (v*(metrics[key]?.scale || 1)).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-GB', {minimumFractionDigits:metrics[key]?.digits || 0, maximumFractionDigits:metrics[key]?.digits || 0}) : '—';
  const date = ts => C.finite(ts) ? new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN':'en-GB',{timeZone:'Europe/Lisbon',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(ts*1000)) : t('never');
  function age(ts) {
    if (!C.finite(ts)) return t('never');
    const seconds=Math.max(0,now()-ts);
    if(seconds<60) return t('now');
    const number=seconds<3600?Math.floor(seconds/60):seconds<86400?Math.floor(seconds/3600):Math.floor(seconds/86400);
    const unit=seconds<3600?(lang==='zh'?'分钟':'m'):seconds<86400?(lang==='zh'?'小时':'h'):(lang==='zh'?'天':'d');
    return lang==='zh'?`${number}${unit}前`:`${number}${unit} ago`;
  }
  function content(id, html) {
    const el=$(id); if(el.innerHTML===html) return;
    const active=document.activeElement, key=el.contains(active)?active.dataset.focus:null, scroll=el.scrollTop;
    el.innerHTML=html; el.scrollTop=scroll;
    if(key) [...el.querySelectorAll('[data-focus]')].find(n=>n.dataset.focus===key)?.focus({preventScroll:true});
  }
  function bootMetrics() {
    $('readouts').innerHTML=primary.map(key=>`<button type="button" class="metric" data-metric="${key}"><span class="metric-name"></span><span class="metric-value"></span><span class="secondary"></span><span class="stamp"></span></button>`).join('');
    $('readouts').addEventListener('click', e=>{const button=e.target.closest('[data-metric]');if(button)openDetail(button.dataset.metric);});
    $('trend-tabs').innerHTML=Object.keys(metrics).slice(0,6).map(key=>`<button type="button" data-key="${key}"></button>`).join('');
    $('trend-tabs').addEventListener('click',e=>{if(e.target.dataset.key){chartKey=e.target.dataset.key;renderChart();}});
  }
  function renderMetrics() {
    for(const button of $('readouts').children){
      const key=button.dataset.metric, m=metrics[key], ts=meta[key]?.last_received, st=status(ts);
      button.className='metric '+st;
      button.querySelector('.metric-name').innerHTML=`${t(m.name)} <span aria-hidden="true">↗</span>`;
      button.querySelector('.metric-value').innerHTML=`${format(key,state[key])}<small>${m.unit}</small>`;
      const secondary = key==='weather.temp'?`${t('humidity')} ${format('weather.hum',state['weather.hum'])}%`
        : key==='weather.wind'?`${C.direction(state['weather.wind_dir'])} · ${C.finite(state['weather.wind_dir'])?Math.round(state['weather.wind_dir'])+'°':'—'}`
        : key==='weather.rain_rate'?(lang==='zh'?'瞬时强度 · 非累计雨量':'Instantaneous · not accumulated')
        : key==='soil.hum'?`${t('soilTemp')} ${format('soil.temp',state['soil.temp'])}°C`
        : `PM2.5 ${format('weather.pm25',state['weather.pm25'])} µg/m³`;
      const secondaryKey={'weather.temp':'weather.hum','weather.wind':'weather.wind_dir','soil.hum':'soil.temp','weather.co2':'weather.pm25'}[key];
      const secondaryStatus=secondaryKey?status(meta[secondaryKey]?.last_received):null;
      button.querySelector('.secondary').textContent=secondary+(secondaryStatus && secondaryStatus!=='live'?' · '+symbols[secondaryStatus]+' '+t(secondaryStatus):'');
      button.querySelector('.secondary').title=secondaryKey?`${t('lastReceived')}: ${date(meta[secondaryKey]?.last_received)}`:'';
      const stamp=button.querySelector('.stamp'); stamp.className='stamp '+st;
      stamp.textContent=`${symbols[st]} ${t(st)} · ${age(ts)}`;
      button.setAttribute('aria-label',`${t(m.name)} ${format(key,state[key])} ${m.unit}, ${t(st)}, ${age(ts)}`);
    }
  }
  function renderSystem() {
    $('connection').dataset.state=socketState;
    $('broker').dataset.state=server.mode==='demo'?'isolated':server.mqtt_connected?'connected':'offline';
    $('mode').textContent=t(server.mode==='demo'?'demo':'liveMode');
    $('connection').textContent=t(socketState==='open'?'connected':socketState==='connecting'?'connecting':'reconnecting');
    $('broker').textContent=t(server.mode==='demo'?'mqttDemo':server.mqtt_connected?'mqttOn':'mqttOff');
    const sources=[...health.lora,...health.meshtastic];
    $('coverage').textContent=sources.length?`${sources.filter(s=>status(s.last_seen)==='live').length}/${sources.length} ${t('sourcesRecent')}`:t('waiting');
    const notices=[];
    if(apiError) notices.push(t('apiError'));
    else if(receivedAt && performance.now()-receivedAt>90000) notices.push(t('snapshotOld'));
    if(historyError)notices.push(t('historyError'));
    if(server.storage_error)notices.push(t('storageError'));
    if(socketState==='closed')notices.push(t('wsError'));
    if(server.mode==='demo')notices.push(t('demoNotice'));
    $('notice').className='notice '+(apiError||server.storage_error?'error':notices.length===1&&server.mode==='demo'?'demo':'delayed');
    $('notice').hidden=!notices.length;$('notice').textContent=(apiError||server.storage_error?'× ':'')+notices.join(' ');
  }
  function sourceName(source) {
    const metric=Object.entries(meta).find(([,m])=>m.source===source.id)?.[0];
    if(source.name===source.id && metric) return metric.startsWith('soil.')?(lang==='zh'?'土壤传感器':'Soil sensor'):(lang==='zh'?'气象站':'Weather station');
    return source.name || source.id;
  }
  function renderHealth() {
    const rank={down:0,unknown:1,stale:2,live:3};
    const sources=[...health.lora].sort((a,b)=>rank[status(a.last_seen)]-rank[status(b.last_seen)]);
    $('sourceCount').textContent=sources.length+' LoRa';
    $('sources').closest('.health').dataset.attention=String(sources.some(s=>status(s.last_seen)!=='live'));
    content('sources',sources.length?sources.map(source=>{
      const st=status(source.last_seen);
      return `<div class="source-row ${st}"><span class="symbol" aria-hidden="true">${symbols[st]}</span><div class="source-name">${esc(sourceName(source))}<small>${esc(t('received'))} ${esc(date(source.last_seen))}</small></div><div class="source-age">${t(st)}<span>${age(source.last_seen)}</span></div></div>`;
    }).join(''):`<p class="empty">${t('noSources')}</p>`);
  }
  function renderAtlas() {
    const positions=C.project(mesh.nodes);
    $('positionCount').textContent=`${positions.length} ${t('located')} / ${mesh.nodes.length-positions.length} ${t('unlocated')}`;
    const plot=$('atlas'), width=Math.max(300,plot.clientWidth), height=Math.max(180,plot.clientHeight);
    plot.setAttribute('viewBox',`0 0 ${width} ${height}`);
    const xs=positions.map(n=>n.x), ys=positions.map(n=>n.y);
    const spanX=positions.length?Math.max(...xs)-Math.min(...xs):0, spanY=positions.length?Math.max(...ys)-Math.min(...ys):0;
    const scale=Math.min((width-170)/Math.max(spanX,1),(height-90)/Math.max(spanY,1),2);
    const px=x=>width/2+(x-300)*scale, py=y=>height/2+(y-140)*scale;
    let svg=`<path class="map-grid" d="M20 26H${width-20}V${height-22}H20Z"/>`;
    svg+=`<path d="M${width-28} 55V33m-4 7 4-7 4 7" fill="none" stroke="var(--muted)"/><text class="map-text" x="${width-33}" y="22">N</text>`;
    positions.forEach(n=>{
      const st=status(n.position_ts), label=n.name || n.id, align=n.x>300?'end':'start', tx=n.x>300?-18:18;
      svg+=`<g class="map-node ${st}${selectedNode===n.id?' selected':''}" role="button" tabindex="0" data-node="${esc(n.id)}" data-focus="${esc(n.id)}" aria-label="${esc(label+', '+t(st))}" transform="translate(${px(n.x).toFixed(2)} ${py(n.y).toFixed(2)})"><title>${esc(label)} · ${n.lat.toFixed(5)}, ${n.lon.toFixed(5)} · ${age(n.position_ts)}</title><circle class="node-ring" r="11"/><text text-anchor="middle" y="5">${symbols[st]}</text><text x="${tx}" y="-4" text-anchor="${align}">${esc(label.length>22?label.slice(0,21)+'…':label)}</text><text x="${tx}" y="15" text-anchor="${align}">${esc(age(n.position_ts))}</text></g>`;
    });
    content('atlas',svg);$('atlas-empty').hidden=positions.length>0;$('atlas-empty').textContent=t('noPositions');
    const node=mesh.nodes.find(n=>n.id===selectedNode);
    if(node) $('position-detail').innerHTML=`<b>${esc(node.name)}</b> · ${C.finite(node.lat)&&C.finite(node.lon)?`${node.lat.toFixed(5)}, ${node.lon.toFixed(5)} · ${t('positionReceived')}: ${age(node.position_ts)}`:t('noCoords')}`;
    else $('position-detail').textContent=positions.length?t('selectNode'):'';
  }
  function battery(n) {return n.battery===101?t('externalPower'):C.finite(n.battery)?`${Math.round(n.battery)}%`:'—';}
  function renderMesh() {
    $('mesh-summary').innerHTML=`<strong>${mesh.nodes.length}</strong> ${t('heard')} · ${mesh.nodes.filter(n=>status(n.last_heard_ts)==='live').length} ${t('live')}`;
    content('mesh-nodes',mesh.nodes.length?mesh.nodes.map(n=>{
      const st=status(n.last_heard_ts);
      return `<div class="mesh-node ${st}"><button data-node="${esc(n.id)}" data-focus="${esc(n.id)}" aria-label="${esc(n.name+', '+t(st)+', '+t('battery')+' '+battery(n))}">${symbols[st]} ${esc(n.name)}<span class="mesh-node-state">${t(st)} · ${age(n.last_heard_ts)}</span></button><small>${esc(battery(n))} · ${C.finite(n.hops)?n.hops+' '+t('hops'):'—'}</small></div>`;
    }).join(''):`<p class="empty">${t('noMesh')}</p>`);
    const msgs=Array.isArray(state['mesh.msgs'])?state['mesh.msgs']:[];
    $('messageCount').textContent=String(msgs.length);
    const html=msgs.length?msgs.map(m=>`<article class="message"><div class="message-head"><strong>${esc(m.who)}</strong><span>${esc(C.finite(m.ts)?date(m.ts):m.meta)}</span></div><p>${esc(m.text)}</p></article>`).join(''):`<p class="empty">${t('noMessages')}</p>`;
    if(renderedMessages!==html){const box=$('messages'),bottom=box.scrollHeight-box.scrollTop-box.clientHeight<40;box.innerHTML=html;if(bottom)box.scrollTop=box.scrollHeight;renderedMessages=html;}
  }
  function chartSeries(key=chartKey) {return C.series(history[key],historyEnd-hours*3600,historyEnd);}
  function renderChart() {
    [...$('trend-tabs').children].forEach(button=>{button.textContent=t(metrics[button.dataset.key].name);button.setAttribute('aria-pressed',String(button.dataset.key===chartKey));});
    const points=chartSeries(), m=metrics[chartKey];
    $('chart-label').textContent=`${t(m.name)} · ${m.unit}`;
    $('chart-summary').textContent=points.length?`${points.length} ${t('sample')} · ${t('min')} ${format(chartKey,Math.min(...points.map(p=>p[1])))} · ${t('max')} ${format(chartKey,Math.max(...points.map(p=>p[1])))}`:t('waiting');
    $('chart-empty').hidden=points.length>0;$('chart-empty').textContent=t('noHistory');
    if(!points.length){$('trend-chart').innerHTML='';return;}
    const width=Math.max(300,$('trend-chart').clientWidth),height=Math.max(60,$('trend-chart').clientHeight);
    $('trend-chart').setAttribute('viewBox',`0 0 ${width} ${height}`);
    const start=historyEnd-hours*3600,left=46,right=width-8,top=10,bottom=height-24;
    let min=points.length?Math.min(...points.map(p=>p[1])):0, max=points.length?Math.max(...points.map(p=>p[1])):1;
    if(min===max){min-=1;max+=1;}
    const pad=(max-min)*.12;min-=pad;max+=pad;
    const x=ts=>left+(ts-start)/(hours*3600)*(right-left), y=v=>bottom-(v-min)/(max-min)*(bottom-top);
    let html='';
    for(let i=0;i<3;i++){const v=min+(max-min)*i/2,Y=y(v);html+=`<line class="chart-grid" x1="${left}" x2="${right}" y1="${Y}" y2="${Y}"/><text class="chart-text" x="36" y="${Y+4}" text-anchor="end">${format(chartKey,v)}</text>`;}
    const ticks=width<500?2:4;
    for(let i=0;i<=ticks;i++){const ts=start+i*hours*3600/ticks, label=new Intl.DateTimeFormat(lang==='zh'?'zh-CN':'en-GB',{timeZone:'Europe/Lisbon',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ts*1000));html+=`<text class="chart-text" x="${x(ts)}" y="${height-4}" text-anchor="${i===0?'start':i===ticks?'end':'middle'}">${label}</text>`;}
    for(const group of C.segments(points)) html+=`<path class="chart-line" d="${group.map((p,i)=>(i?'L':'M')+x(p[0]).toFixed(1)+' '+y(p[1]).toFixed(1)).join(' ')}"/>`;
    for(const p of points)html+=`<circle class="chart-dot" cx="${x(p[0]).toFixed(1)}" cy="${y(p[1]).toFixed(1)}" r="2.5"><title>${esc(date(p[0]))}: ${format(chartKey,p[1])} ${m.unit}</title></circle>`;
    $('trend-chart').innerHTML=html;
  }
  function openDetail(key) {
    detailKey=key;renderDetail();if(!$('detail').open)$('detail').showModal();
  }
  function renderDetail() {
    if(!detailKey)return;
    const key=detailKey,m=metrics[key], data=meta[key]||{}, points=chartSeries(key).slice().reverse();
    $('detail-title').textContent=t(m.name);
    const extra = Object.entries(metrics).filter(([k])=>k.startsWith(key.split('.')[0]+'.')&&k!==key);
    $('detail-body').innerHTML=`<p class="detail-value">${format(key,state[key])} <small>${m.unit}</small></p><p class="detail-meta">${symbols[status(data.last_received)]} ${t(status(data.last_received))} · ${t('lastReceived')}: ${date(data.last_received)} (${age(data.last_received)})<br>${t('source')}: ${esc(data.source || '—')} · ${esc(data.field || '—')}</p><details><summary>${t('inspectMore')}</summary><table class="detail-table"><tbody>${extra.map(([k,v])=>`<tr><td>${t(v.name)}</td><td>${format(k,state[k])} ${v.unit}<br><small>${t(status(meta[k]?.last_received))} · ${age(meta[k]?.last_received)}</small></td></tr>`).join('')}</tbody></table></details><h3 style="margin-top:20px">${t('raw')} · ${hours} h</h3>${points.length?`<table class="detail-table"><thead><tr><th>${t('received')} · ${t('lisbon')}</th><th>${t('value')} (${m.unit})</th></tr></thead><tbody>${points.map(p=>`<tr><td>${date(p[0])}</td><td>${format(key,p[1])}</td></tr>`).join('')}</tbody></table>`:`<p class="empty">${t('noHistory')}</p>`}`;
  }
  function render() {renderSystem();renderMetrics();renderHealth();renderAtlas();renderMesh();}
  function applyLang() {
    document.documentElement.lang=lang==='zh'?'zh-CN':'en';
    document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));
    $('langToggle').textContent=lang==='en'?'中文':'EN';$('langToggle').setAttribute('aria-label',lang==='en'?'切换到中文':'Switch to English');
    for(const [id,key] of [['sources','sources'],['mesh-nodes','mesh'],['messages','messages'],['trend-tabs','trends']])$(id).setAttribute('aria-label',t(key));
    renderedMessages='';render();renderChart();if($('detail').open)renderDetail();tick();
  }
  async function json(path) {
    const response=await fetch((window.FARM_API_BASE||'')+path,{cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw new Error('HTTP '+response.status);
    return response.json();
  }
  async function refresh() {
    if(busy)return;busy=true;$('refresh').disabled=true;$('window').disabled=true;
    try {
      const results=await Promise.allSettled([json('/api/overview'),json('/api/history?hours='+hours)]);
      const overview=results[0];
      if(overview.status==='fulfilled' && C.validOverview(overview.value)) {
        const d=overview.value;
        for(const key of Object.keys(meta)){if((meta[key]?.last_received||0)>d.server.generated_at){d.metrics[key]=meta[key];d.state[key]=state[key];}}
        state=d.state;meta=d.metrics;health=d.health;mesh=d.mesh;server=d.server;
        serverTime=server.generated_at;receivedAt=performance.now();apiError=false;
      } else apiError=true;
      const h=results[1];
      if(h.status==='fulfilled' && h.value && typeof h.value==='object' && !Array.isArray(h.value)) {
        history=h.value;historyEnd=now();historyError=false;
      } else historyError=true;
      render();renderChart();
    } finally {busy=false;$('refresh').disabled=false;$('window').disabled=false;}
  }
  let reconnectTimer, retry=1500;
  async function connect() {
    let ws;
    try {ws=new WebSocket(await window.farmSocketURL());}catch(_){socketState='closed';renderSystem();reconnectTimer=setTimeout(connect,retry);return;}
    ws.onopen=()=>{socketState='open';retry=1500;renderSystem();refresh();};
    ws.onmessage=event=>{
      try {
        const msg=JSON.parse(event.data);
        if((msg.type==='snapshot'||msg.type==='update') && msg.data && typeof msg.data==='object') {
          for(const [key,value] of Object.entries(msg.data))if(C.finite(value)||value===null||key==='mesh.msgs'&&Array.isArray(value))state[key]=value;
          if(msg.meta && typeof msg.meta==='object')Object.assign(meta,msg.meta);
          renderMetrics();renderMesh();
        }
      }catch(_){/* Ignore malformed packets without losing the reconnect loop. */}
    };
    ws.onclose=()=>{socketState='closed';renderSystem();clearTimeout(reconnectTimer);reconnectTimer=setTimeout(connect,retry);retry=Math.min(retry*2,30000);};
    ws.onerror=()=>ws.close();
  }
  function tick(){
    $('clock').textContent=new Intl.DateTimeFormat(lang==='zh'?'zh-CN':'en-GB',{timeZone:'Europe/Lisbon',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
    $('date').textContent=new Intl.DateTimeFormat(lang==='zh'?'zh-CN':'en-GB',{timeZone:'Europe/Lisbon',day:'numeric',month:'short'}).format(new Date())+' · '+t('lisbon');
  }
  $('refresh').addEventListener('click',refresh);
  $('langToggle').addEventListener('click',()=>{lang=lang==='en'?'zh':'en';try{localStorage.setItem('farm-lang',lang);}catch(_){}applyLang();});
  $('window').addEventListener('change',()=>{hours=Number($('window').value);refresh();});
  $('viewReadings').addEventListener('click',()=>openDetail(chartKey));
  $('closeDetail').addEventListener('click',()=>$('detail').close());
  function selectNode(event){const node=event.target.closest('[data-node]');if(node){selectedNode=node.dataset.node;renderAtlas();}}
  $('atlas').addEventListener('click',selectNode);
  $('atlas').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectNode(event);}});
  $('mesh-nodes').addEventListener('click',selectNode);
  bootMetrics();historyEnd=now();applyLang();refresh();connect();
  new ResizeObserver(()=>{renderChart();renderAtlas();}).observe($('trend-chart').parentElement);
  setInterval(refresh,30000);
  setInterval(()=>{tick();render();},15000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
