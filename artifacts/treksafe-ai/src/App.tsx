import { useEffect, useMemo, useState, type ReactNode } from 'react';
import './app.css';
import './pages.css';
import './prototype.css';
import { Link, Route, Switch, useLocation } from 'wouter';
import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, ArrowUpRight,
  BarChart3, Bell, Check, CheckCircle2, ChevronRight, CircleHelp, Compass,
  Download, Eye, Footprints, Gauge, Glasses, Info, Layers3, MapPin, Menu,
  Mountain, Navigation, Pause, Play, Radio, RotateCcw, Route as RouteIcon,
  Shield, ShieldAlert, ShieldCheck, SlidersHorizontal, Smartphone, Sparkles,
  Thermometer, Timer, TriangleAlert, Vibrate, Wifi, Wind, X,
} from 'lucide-react';
import { predictSafety, SYNTHETIC_DATASET_INFO, type Prediction, type SafetyFeatures } from '@/lib/safety-model';

type ScenarioId = 'animal' | 'clear' | 'obstacle' | 'steep' | 'visibility' | 'safe';
type Trip = {
  id:string; name:string; date:string; duration:number; distance:number;
  label:Prediction['label']; maxRisk:Prediction['label']; scenario:string;
  wildlifeAlerts:number; terrainAlerts:number; obstacleAlerts:number;
  detectionCount:number; averageDetectionDistance:number; safetyScore:number;
};
type Preferences = { alerts:boolean; vibration:boolean; units:'metric'|'imperial'; confidence:number };

const baseline:SafetyFeatures = {
  objectDistanceM: 24, objectCategory:'none', terrainType:'easy', slopeDegrees:8,
  visibilityM:180, temperatureC:14, animalProximity:false, obstacleDensity:0,
  environmentalCondition:'clear',
};
const scenarios: Record<ScenarioId,{title:string;sub:string;features:SafetyFeatures}> = {
  animal:{title:'Animal detected',sub:'Wildlife at close range',features:{...baseline,objectDistanceM:7,objectCategory:'wildlife',animalProximity:true,obstacleDensity:1}},
  clear:{title:'No animal',sub:'Clear trail conditions',features:{...baseline,objectDistanceM:46}},
  obstacle:{title:'Obstacle',sub:'Trail obstruction ahead',features:{...baseline,objectDistanceM:4,objectCategory:'obstacle',obstacleDensity:6,terrainType:'rocky'}},
  steep:{title:'Steep terrain',sub:'High gradient section',features:{...baseline,terrainType:'steep',slopeDegrees:37,obstacleDensity:2}},
  visibility:{title:'Low visibility',sub:'Fog reducing sightlines',features:{...baseline,visibilityM:13,environmentalCondition:'fog',temperatureC:8}},
  safe:{title:'Safe trail',sub:'Favorable conditions',features:{...baseline,objectDistanceM:72,visibilityM:240,slopeDegrees:4,temperatureC:16}},
};
const navItems = [
  {path:'/',label:'Overview',icon:Compass},
  {path:'/detection',label:'Live detection',icon:Eye},
  {path:'/map',label:'Trail map',icon:MapPin},
  {path:'/analysis',label:'Model analysis',icon:BarChart3},
  {path:'/devices',label:'Glasses device',icon:Glasses},
  {path:'/history',label:'Trip history',icon:RouteIcon},
  {path:'/settings',label:'Settings',icon:SlidersHorizontal},
];
const labelColor:Record<Prediction['label'],string>={SAFE:'safe',CAUTION:'caution',DANGER:'danger'};
const labelIcon:Record<Prediction['label'],typeof ShieldCheck>={SAFE:ShieldCheck,CAUTION:AlertTriangle,DANGER:ShieldAlert};
const demoTrip=(id:string,name:string,daysAgo:number,duration:number,distance:number,label:Trip['label'],scenario:string,counts:{wildlife:number;terrain:number;obstacle:number},detectionDistance:number,safetyScore:number):Trip=>({
 id,name,date:new Date(Date.now()-daysAgo*86400000).toISOString(),duration,distance,label,maxRisk:label,scenario,
 wildlifeAlerts:counts.wildlife,terrainAlerts:counts.terrain,obstacleAlerts:counts.obstacle,
 detectionCount:counts.wildlife+counts.obstacle,averageDetectionDistance:detectionDistance,safetyScore,
});
const SAMPLE_TRIPS:Trip[]=[
 demoTrip('demo-ridge','North Ridge Loop',1,116,5.4,'CAUTION','Wildlife nearby',{wildlife:1,terrain:0,obstacle:0},34,76),
 demoTrip('demo-forest','Pine Creek Traverse',3,82,3.2,'SAFE','Clear trail',{wildlife:0,terrain:0,obstacle:0},0,94),
 demoTrip('demo-pass','Alpine Pass Section',7,148,6.8,'DANGER','Steep terrain',{wildlife:0,terrain:1,obstacle:1},12,48),
];
const readTrips=():Trip[]=>{try{const stored=localStorage.getItem('treksafe-trips');return stored===null?SAMPLE_TRIPS:JSON.parse(stored) as Trip[]}catch{return SAMPLE_TRIPS}};
const readPrefs=():Preferences=>{try{return {...{alerts:true,vibration:true,units:'metric',confidence:65},...JSON.parse(localStorage.getItem('treksafe-prefs')||'{}')} as Preferences}catch{return{alerts:true,vibration:true,units:'metric',confidence:65}}};

function IconButton({children,onClick,label,className=''}:{children:ReactNode;onClick:()=>void;label:string;className?:string}) {
  return <button data-testid={`button-${label.toLowerCase().replaceAll(' ','-')}`} aria-label={label} onClick={onClick} className={`icon-button ${className}`}>{children}</button>;
}
function Button({children,onClick,variant='primary',className='',disabled=false}:{children:ReactNode;onClick?:()=>void;variant?:'primary'|'quiet'|'outline'|'danger';className?:string;disabled?:boolean}) {
  return <button disabled={disabled} onClick={onClick} className={`button button-${variant} ${className}`}>{children}</button>;
}
function Card({children,className=''}:{children:ReactNode;className?:string}) { return <section className={`glass card ${className}`}>{children}</section>; }
function PageHead({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:ReactNode}) {
  return <header className="page-head"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</header>;
}
function DemoTag(){return <span className="demo-tag"><span className="demo-dot"/>DEMO DATA</span>}
function StatusPill({label}:{label:Prediction['label']}){const Icon=labelIcon[label];return <span className={`status-pill ${labelColor[label]}`}><Icon size={14}/>{label}</span>}
function Meter({value,color='cyan'}:{value:number;color?:string}){return <div className="meter-track"><div className={`meter-fill ${color}`} style={{width:`${Math.max(0,Math.min(100,value))}%`}}/></div>}

function App(){
  const [location]=useLocation();
  const [features,setFeatures]=useState<SafetyFeatures>(scenarios.safe.features);
  const [scenario,setScenario]=useState<ScenarioId>('safe');
  const [deviceConnected,setDeviceConnected]=useState(true);
  const [prefs,setPrefs]=useState<Preferences>(readPrefs);
  const [trips,setTrips]=useState<Trip[]>(readTrips);
  const [running,setRunning]=useState(false);
  const [elapsed,setElapsed]=useState(0);
  const [notice,setNotice]=useState('');
  const [mobileOpen,setMobileOpen]=useState(false);
  const prediction=useMemo(()=>predictSafety(features),[features]);
  const scenarioInfo=scenarios[scenario];
  useEffect(()=>{localStorage.setItem('treksafe-prefs',JSON.stringify(prefs));},[prefs]);
  useEffect(()=>{localStorage.setItem('treksafe-trips',JSON.stringify(trips));},[trips]);
  useEffect(()=>{if(!running)return;const timer=window.setInterval(()=>setElapsed(v=>v+1),1000);return()=>window.clearInterval(timer);},[running]);
  useEffect(()=>{if(!notice)return;const t=window.setTimeout(()=>setNotice(''),3300);return()=>window.clearTimeout(t);},[notice]);
  useEffect(()=>{setMobileOpen(false);},[location]);
  const chooseScenario=(id:ScenarioId)=>{
    setScenario(id);setFeatures(scenarios[id].features);
    const next=predictSafety(scenarios[id].features);
    if(prefs.alerts&&next.label!=='SAFE')setNotice(`${next.label}: ${scenarios[id].title} scenario`);
  };
  const finishTrip=()=>{
    const wildlifeAlert=features.objectCategory==='wildlife'&&(features.animalProximity||features.objectDistanceM<30)?1:0;
    const obstacleAlert=features.objectCategory==='obstacle'?1:0;
    const terrainAlert=features.terrainType==='steep'||features.slopeDegrees>=30||features.environmentalCondition==='fog'?1:0;
    const detectionCount=wildlifeAlert+obstacleAlert;
    const safetyScore=Math.round(100*(prediction.voteShares.SAFE+prediction.voteShares.CAUTION*0.65+prediction.voteShares.DANGER*0.15));
    const entry:Trip={
      id:`trip-${Date.now()}`,name:`${scenarioInfo.title} trail demo`,date:new Date().toISOString(),
      duration:Math.max(elapsed,1),distance:Number((0.7+elapsed/620).toFixed(1)),
      label:prediction.label,maxRisk:prediction.label,scenario:scenarioInfo.title,
      wildlifeAlerts:wildlifeAlert,terrainAlerts:terrainAlert,obstacleAlerts:obstacleAlert,
      detectionCount,averageDetectionDistance:detectionCount?features.objectDistanceM:0,safetyScore,
    };
    setTrips(prev=>[entry,...prev]);setRunning(false);setElapsed(0);setNotice('Demo trip saved to trip history');
  };
  const triggerFeedback=()=>{setNotice(prefs.vibration?'Vibration feedback simulated — glasses hardware not connected':'Vibration feedback is turned off in settings');};
  const reset=()=>{setFeatures(scenarios.safe.features);setScenario('safe');setRunning(false);setElapsed(0);};
  const shared={features,setFeatures,prediction,scenario,chooseScenario,deviceConnected,setDeviceConnected,prefs,setPrefs,trips,setTrips,running,setRunning,elapsed,setElapsed,finishTrip,triggerFeedback,notice,setNotice};
  return <div className="app-shell noise">
    <div className="mobile-top"><Link href="/" className="brand"><Logo/><span>TREKSAFE<span className="brand-light"> / AI</span></span></Link><button className="mobile-menu" onClick={()=>setMobileOpen(v=>!v)} aria-label="Open navigation"><Menu size={20}/></button></div>
    <aside className={`sidebar ${mobileOpen?'sidebar-open':''}`}>
      <Link href="/" className="brand brand-desktop"><Logo/><span>TREKSAFE<span className="brand-light"> / AI</span></span></Link>
      <div className="sidebar-project"><span className="project-mark"><Mountain size={15}/></span><div><strong>Field prototype</strong><small>Safety companion · v0.8</small></div><span className="online-dot"/></div>
      <div className="nav-label">WORKSPACE</div>
      <nav className="side-nav">{navItems.map(item=>{const Icon=item.icon;const active=location===item.path;return <Link data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ','-')}`} key={item.path} href={item.path} className={`nav-item ${active?'nav-active':''}`}><Icon size={17} strokeWidth={1.8}/><span>{item.label}</span>{item.path==='/detection'&&<span className="nav-live">LIVE</span>}</Link>})}</nav>
      <div className="sidebar-bottom"><div className="field-note"><span className="field-icon"><Info size={14}/></span><div><strong>Prototype mode</strong><p>Sensor readings and detections are simulated.</p></div></div><div className="profile-row"><div className="profile-avatar">TS</div><div><strong>Trail session</strong><small>Local demo workspace</small></div><span className="profile-chevron"><ChevronRight size={15}/></span></div></div>
    </aside>
    {mobileOpen&&<button className="mobile-scrim" onClick={()=>setMobileOpen(false)} aria-label="Close navigation"/>}
    <main className="main-area">
      <div className="topbar"><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={13}/><strong>{navItems.find(n=>n.path===location)?.label||'Overview'}</strong></div><div className="topbar-right"><span className="top-demo"><span/>SIMULATION ENVIRONMENT</span><button className="notification-button" onClick={()=>setNotice('No new alerts. Current readings are simulated.')} aria-label="Notifications"><Bell size={17}/><i/></button><div className={`device-indicator ${deviceConnected?'connected':''}`}><span className="device-dot"/>{deviceConnected?'Demo glasses connected':'No device paired'}</div></div></div>
      <Switch>
        <Route path="/"><Dashboard {...shared} onReset={reset}/></Route>
        <Route path="/detection"><Detection {...shared}/></Route>
        <Route path="/map"><TrailMap {...shared}/></Route>
        <Route path="/analysis"><Analysis {...shared}/></Route>
        <Route path="/devices"><Devices {...shared}/></Route>
        <Route path="/history"><History {...shared}/></Route>
        <Route path="/settings"><Settings {...shared}/></Route>
        <Route><NotFound/></Route>
      </Switch>
      <footer className="site-footer"><span><Shield size={13}/> TrekSafe AI <span className="footer-sep">/</span> Proof of concept</span><span>Not a substitute for trail judgment or emergency services.</span></footer>
    </main>
    {notice&&<div className={`toast ${notice.startsWith('DANGER')?'toast-danger':''}`} role="status"><span className="toast-symbol"><Check size={15}/></span>{notice}<button onClick={()=>setNotice('')} aria-label="Dismiss notification"><X size={14}/></button></div>}
  </div>;
}

function Logo(){return <span className="logo-symbol"><Mountain size={19} strokeWidth={2}/><span/></span>}
type Shared={
 features:SafetyFeatures;setFeatures:(f:SafetyFeatures)=>void;prediction:Prediction;scenario:ScenarioId;
 chooseScenario:(s:ScenarioId)=>void;deviceConnected:boolean;setDeviceConnected:(v:boolean)=>void;
 prefs:Preferences;setPrefs:(p:Preferences)=>void;trips:Trip[];setTrips:(f:(prev:Trip[])=>Trip[])=>void;
 running:boolean;setRunning:(v:boolean)=>void;elapsed:number;setElapsed:(n:number)=>void;
 finishTrip:()=>void;triggerFeedback:()=>void;notice:string;setNotice:(s:string)=>void;
};
type DashboardProps=Shared&{onReset:()=>void};
function Dashboard({features,prediction,scenario,chooseScenario,running,setRunning,elapsed,finishTrip,triggerFeedback,trips,onReset,deviceConnected}:DashboardProps){
 const ResultIcon=labelIcon[prediction.label];
 return <div className="page-content animate-in">
   <PageHead eyebrow="FIELD OVERVIEW  /  DEMO SESSION" title="Your trail, in view." description="A live-feeling safety overview using synthetic sensor inputs and a proof-of-concept model." action={<div className="demo-header"><DemoTag/><span className="last-updated"><span className="pulse-dot"/>SIMULATION ACTIVE</span></div>}/>
   <div className="dashboard-hero">
    <div className={`hero-status status-${labelColor[prediction.label]}`}>
      <div className="hero-orb"><ResultIcon size={28}/><span className="orb-ring"/></div>
      <div className="hero-text"><div className="eyebrow">CURRENT TRAIL ASSESSMENT <span className="assessment-demo">· SIMULATED</span></div><h2>{prediction.label==='SAFE'?'Conditions look steady':prediction.label==='CAUTION'?'Stay alert on this section':'Potential hazard ahead'}</h2><p>{prediction.reasons?.[0]||'Model assessment based on the current demo sensor profile.'}</p></div>
    <div className="hero-confidence"><span>WINNING TREE VOTE</span><strong>{(prediction.confidence*100).toFixed(1)}<small>%</small></strong><div className="confidence-line"><Meter value={prediction.confidence*100} color={labelColor[prediction.label]}/></div></div>
    </div>
    <div className="hero-bottom"><div className="hero-route"><span className="route-icon"><Navigation size={15}/></span><div><strong>Alpine pass · sample route</strong><small>Coordinates shown are illustrative demo data</small></div></div><div className="hero-actions"><Button variant="quiet" onClick={triggerFeedback}><Vibrate size={15}/>Test haptic</Button><Link href="/detection" className="button button-primary">Open detection <ArrowRight size={15}/></Link></div></div>
   </div>
   <div className="metric-row">
    <Metric icon={<RouteIcon size={16}/>} label="TRIP DISTANCE" value={running?`${(0.7+elapsed/620).toFixed(1)} km`:'—'} foot={running?'Current simulated trip':'Start a session to track'} accent="cyan"/>
    <Metric icon={<Timer size={16}/>} label="TIME ON TRAIL" value={running?formatTime(elapsed):'—'} foot={running?'Session in progress':'No active trip'} accent="blue"/>
    <Metric icon={<Activity size={16}/>} label="VISIBILITY" value={`${features.visibilityM} m`} foot="Simulated sensor estimate" accent="amber"/>
     <Metric icon={<Thermometer size={16}/>} label="AIR TEMPERATURE" value={`${features.temperatureC}°C`} foot="Synthetic reading" accent="cyan"/>
   </div>
   <div className="telemetry-grid">
    <Telemetry label="GPS LOCATION" value="47.421° N · 121.713° W" detail="Simulated coordinates" icon={<MapPin size={14}/>} />
    <Telemetry label="TRAIL STATUS" value="Open · demo route" detail="Not live trail information" icon={<RouteIcon size={14}/>} />
    <Telemetry label="DETECTION" value={features.objectCategory==='none'?'No object signal':`${features.objectCategory} signal`} detail="Synthetic input" icon={<Eye size={14}/>} />
    <Telemetry label="SENSOR STATUS" value="SIMULATED · ONLINE" detail="No physical sensors connected" icon={<Activity size={14}/>} />
    <Telemetry label="OBJECT DISTANCE" value={features.objectCategory==='none'?'—':`${features.objectDistanceM} m`} detail="Demo estimate" icon={<Navigation size={14}/>} />
    <Telemetry label="TERRAIN" value={`${features.terrainType} · ${features.slopeDegrees}°`} detail="Synthetic terrain profile" icon={<Mountain size={14}/>} />
    <Telemetry label="GLASSES BATTERY" value="86%" detail="Illustrative demo reading" icon={<Gauge size={14}/>} />
    <Telemetry label="DEVICE CONNECTION" value={deviceConnected?"SIMULATED CONNECTED":"NOT CONNECTED"} detail="Toggle on glasses screen" icon={<Wifi size={14}/>} />
   </div>
   <div className="dashboard-grid">
    <Card className="scenario-card"><div className="section-heading"><div><div className="eyebrow">TRY A SCENARIO</div><h3>Set the trail conditions</h3></div><span className="demo-inline">SIMULATED INPUTS</span></div><p className="section-sub">Choose a profile to update the model prediction in real time.</p><div className="scenario-grid">{Object.entries(scenarios).map(([id,item])=><button key={id} onClick={()=>chooseScenario(id as ScenarioId)} className={`scenario-tile ${scenario===id?'scenario-selected':''}`} data-testid={`scenario-${id}`}><span className={`scenario-mark mark-${id}`}>{id==='animal'?<Eye size={16}/>:id==='clear'?<Wind size={16}/>:id==='obstacle'?<TriangleAlert size={16}/>:id==='steep'?<Mountain size={16}/>:id==='visibility'?<Activity size={16}/>:<ShieldCheck size={16}/>}</span><span><strong>{item.title}</strong><small>{item.sub}</small></span>{scenario===id&&<Check size={14} className="scenario-check"/>}</button>)}</div></Card>
    <Card className="quick-card"><div className="section-heading"><div><div className="eyebrow">SESSION CONTROL</div><h3>Trail session</h3></div><div className="session-head-actions"><span className={`session-mark ${running?'session-live':''}`}/><IconButton label="Reset session" onClick={onReset}><RotateCcw size={14}/></IconButton></div></div><div className="session-summary"><span className="session-time">{formatTime(elapsed)}</span><span className={`session-status ${running?'is-running':''}`}>{running?'SESSION RUNNING':'READY TO BEGIN'}</span></div><div className="session-buttons">{running?<><Button onClick={()=>setRunning(false)} variant="outline"><Pause size={15}/> Pause</Button><Button onClick={finishTrip}><Check size={15}/> Finish trip</Button></>:<Button onClick={()=>setRunning(true)} className="start-session"><Play size={15}/> Start demo trip</Button>}</div><div className="session-foot"><Info size={13}/> Completed demo trips are saved locally on this device.</div><Link className="text-link" href="/history">View trip history <ArrowRight size={13}/></Link></Card>
   </div>
  <div className="lower-grid"><Card className="prediction-card"><div className="section-heading"><div><div className="eyebrow">PREDICTION BREAKDOWN</div><h3>Tree vote share</h3></div><Link href="/analysis" className="small-link">Details <ArrowRight size={13}/></Link></div><div className="probability-list">{(['SAFE','CAUTION','DANGER'] as const).map(k=><div className="probability-row" key={k}><span className={`prob-dot ${labelColor[k]}`}/><span className="prob-label">{k}</span><Meter value={prediction.voteShares[k]*100} color={labelColor[k]}/><strong>{(prediction.voteShares[k]*100).toFixed(1)}%</strong></div>)}</div><div className="prediction-note"><Sparkles size={14}/><span>Vote shares are generated by a synthetic proof-of-concept model, not a field-validated safety system.</span></div></Card>
    <Card className="activity-card"><div className="section-heading"><div><div className="eyebrow">RECENT ACTIVITY</div><h3>Your recent trips</h3></div><Link href="/history" className="small-link">All trips <ArrowRight size={13}/></Link></div>{trips.length?trips.slice(0,3).map(t=><TripRow key={t.id} trip={t}/>):<div className="mini-empty"><span className="empty-icon"><Footprints size={17}/></span><div><strong>No trips recorded yet</strong><p>Start a simulated trail session to build your history.</p></div></div>}</Card>
   </div>
   <LimitNote/>
 </div>;
}
function Metric({icon,label,value,foot,accent}:{icon:ReactNode;label:string;value:string;foot:string;accent:string}){return <Card className={`metric-card metric-${accent}`}><div className="metric-top"><span className="metric-icon">{icon}</span><span className="eyebrow">{label}</span></div><strong className="metric-value">{value}</strong><span className="metric-foot">{foot}</span></Card>}
function Telemetry({label,value,detail,icon}:{label:string;value:string;detail:string;icon:ReactNode}){return <div className="telemetry-item"><span className="telemetry-icon">{icon}</span><div><span className="telemetry-label">{label}</span><strong>{value}</strong><small>{detail}</small></div></div>}
function ScenarioPicker({current,choose}:{current:ScenarioId;choose:(s:ScenarioId)=>void}){return <div className="scenario-grid scenario-grid-compact">{Object.entries(scenarios).map(([id,s])=><button key={id} onClick={()=>choose(id as ScenarioId)} className={`scenario-tile ${current===id?'scenario-selected':''}`}><span className="scenario-mark"><Mountain size={15}/></span><span><strong>{s.title}</strong><small>{s.sub}</small></span>{current===id&&<Check size={14} className="scenario-check"/>}</button>)}</div>}
function Detection({features,setFeatures,prediction,scenario,chooseScenario,triggerFeedback,prefs}:Shared){
 const Icon=labelIcon[prediction.label];
 const [alertVisible,setAlertVisible]=useState(true);
 const change=<K extends keyof SafetyFeatures>(key:K,value:SafetyFeatures[K])=>setFeatures({...features,[key]:value});
 const wildlifeDetected=features.objectCategory==='wildlife'&&features.animalProximity;
 return <div className="page-content animate-in">
  <PageHead eyebrow="SENSOR SIMULATION  /  PROOF OF CONCEPT" title="Detection console" description="Adjust synthetic sensor readings and see how the model responds. No live camera or wildlife detection." action={<DemoTag/>}/>
  <div className="detection-layout">
   <div className="detection-main">
    <Card className={`detection-result result-${labelColor[prediction.label]}`}><div className="result-head"><div className="result-heading"><span className="result-icon"><Icon size={22}/></span><div><div className="eyebrow">MODEL OUTPUT · SYNTHETIC</div><h2>{prediction.label}</h2></div></div><div className="result-confidence"><span>Winning tree vote</span><strong>{(prediction.confidence*100).toFixed(1)}%</strong></div></div><Meter value={prediction.confidence*100} color={labelColor[prediction.label]}/><div className="result-reasons">{prediction.reasons?.length?prediction.reasons.map((r,i)=><div key={`${r}-${i}`}><span className="reason-bullet"/>{r}</div>):<div><span className="reason-bullet"/>No significant factors in this scenario profile.</div>}</div><div className="result-actions"><Button onClick={triggerFeedback} variant="outline"><Vibrate size={15}/>Simulate vibration</Button><span className="future-hardware">Feedback is visual only; glasses vibration is future hardware.</span></div></Card>
    <Card className={`wildlife-demo-card ${wildlifeDetected?'wildlife-demo-active':''}`}><div className="section-heading"><div><div className="eyebrow">WILDLIFE DETECTION · SIMULATED</div><h3>{wildlifeDetected?'Possible Wildlife Detected':'No animal signal in this scenario'}</h3></div><DemoTag/></div>{wildlifeDetected?<><div className="wildlife-facts"><div><span>Type</span><strong>Wild Animal</strong></div><div><span>Demo confidence</span><strong>87% <small>illustrative</small></strong></div><div><span>Estimated distance</span><strong>{features.objectDistanceM} m</strong></div><div><span>Risk</span><strong className="high-risk">HIGH</strong></div></div><div className="wildlife-advice"><AlertTriangle size={15}/><span><strong>Recommended action</strong>Maintain distance and avoid approaching.</span></div><p className="wildlife-disclaimer">Illustrative demo detection only. No camera, thermal sensor, or wildlife detector is connected.</p></>:<p className="wildlife-disclaimer">This status follows the selected synthetic scenario. It does not indicate that the trail is clear of real wildlife.</p>}</Card>
    <Card><div className="section-heading"><div><div className="eyebrow">SCENARIO PRESETS</div><h3>Simulate a trail event</h3></div><DemoTag/></div><p className="section-sub">Presets adjust all relevant inputs together for an easy demo.</p><ScenarioPicker current={scenario} choose={chooseScenario}/></Card>
    <Card><div className="section-heading"><div><div className="eyebrow">SENSOR INPUTS</div><h3>Fine-tune readings</h3></div><span className="demo-inline">ALL VALUES SIMULATED</span></div><div className="sensor-controls">
      <SliderControl label="Object distance" value={features.objectDistanceM} min={0} max={100} unit="m" onChange={v=>change('objectDistanceM',v)}/>
      <SliderControl label="Slope" value={features.slopeDegrees} min={0} max={50} unit="°" onChange={v=>change('slopeDegrees',v)}/>
      <SliderControl label="Visibility" value={features.visibilityM} min={0} max={300} unit="m" onChange={v=>change('visibilityM',v)}/>
      <SliderControl label="Obstacle density" value={features.obstacleDensity} min={0} max={100} unit="%" onChange={v=>change('obstacleDensity',v)}/>
      <SliderControl label="Temperature" value={features.temperatureC} min={-10} max={35} unit="°C" onChange={v=>change('temperatureC',v)}/>
      <SelectControl label="Object category" value={features.objectCategory} values={['none','wildlife','obstacle']} onChange={v=>change('objectCategory',v as SafetyFeatures['objectCategory'])}/>
      <SelectControl label="Terrain" value={features.terrainType} values={['easy','rocky','steep','wet']} onChange={v=>change('terrainType',v as SafetyFeatures['terrainType'])}/>
      <SelectControl label="Conditions" value={features.environmentalCondition} values={['clear','rain','wind','fog']} onChange={v=>change('environmentalCondition',v as SafetyFeatures['environmentalCondition'])}/>
      <label className="toggle-control"><span><strong>Animal proximity</strong><small>Simulated input signal</small></span><input type="checkbox" checked={features.animalProximity} onChange={e=>change('animalProximity',e.target.checked)}/><i/></label>
     </div></Card>
   </div>
   <aside className="detection-aside"><Card className="readings-card"><div className="eyebrow">CURRENT INPUT PROFILE</div><h3>Sensor snapshot</h3><div className="readings-list"><Reading icon={<Navigation size={14}/>} label="Object distance" value={`${features.objectDistanceM} m`}/><Reading icon={<Layers3 size={14}/>} label="Detected category" value={features.objectCategory}/><Reading icon={<Mountain size={14}/>} label="Terrain" value={features.terrainType}/><Reading icon={<Gauge size={14}/>} label="Slope angle" value={`${features.slopeDegrees}°`}/><Reading icon={<Eye size={14}/>} label="Visibility" value={`${features.visibilityM} m`}/><Reading icon={<Thermometer size={14}/>} label="Temperature" value={`${features.temperatureC}°C`}/><Reading icon={<Wind size={14}/>} label="Conditions" value={features.environmentalCondition}/></div></Card>
    {prediction.label!=='SAFE'&&alertVisible&&<div className={`inline-alert alert-${labelColor[prediction.label]}`}><button className="alert-close" aria-label="Dismiss alert" onClick={()=>setAlertVisible(false)}><X size={14}/></button><span className="alert-icon"><AlertTriangle size={17}/></span><div><strong>{prediction.label==='DANGER'?'Potential hazard in scenario':'Caution in scenario'}</strong><p>{prediction.reasons?.[0]||'Check conditions before continuing.'}</p><button onClick={triggerFeedback} className="alert-link"><Vibrate size={13}/>{prefs.vibration?'Test feedback':'Feedback disabled'}</button></div></div>}
    <div className="vibration-demo"><span className="vibration-icon"><Vibrate size={17}/></span><div><div className="eyebrow">VIBRATION ALERT · UI SIMULATION</div><strong>Pattern: 3 short pulses <i>Priority: {prediction.label==='DANGER'?'HIGH':'STANDARD'}</i></strong><small>Actual vibration requires future connected glasses hardware.</small></div><Button variant="outline" onClick={triggerFeedback}>Preview</Button></div>
    <div className="disclaimer-card"><Info size={15}/><p>Prototype only. These values are authored for a software demo and do not come from your phone sensors.</p></div>
   </aside>
  </div>
 </div>;
}
function SliderControl({label,value,min,max,unit,onChange}:{label:string;value:number;min:number;max:number;unit:string;onChange:(n:number)=>void}){return <label className="slider-control"><span><strong>{label}</strong><output>{value}{unit}</output></span><input type="range" min={min} max={max} value={value} onChange={e=>onChange(Number(e.target.value))}/><span className="range-caption"><small>{min}{unit}</small><small>{max}{unit}</small></span></label>}
function SelectControl({label,value,values,onChange}:{label:string;value:string;values:string[];onChange:(v:string)=>void}){return <label className="select-control"><span>{label}</span><select value={value} onChange={e=>onChange(e.target.value)}>{values.map(v=><option key={v} value={v}>{v[0].toUpperCase()+v.slice(1)}</option>)}</select></label>}
function Reading({icon,label,value}:{icon:ReactNode;label:string;value:string}){return <div className="reading-row"><span className="reading-icon">{icon}</span><span>{label}</span><strong>{value}</strong></div>}
function TrailMap({features,prediction,running,setRunning,finishTrip,elapsed}:Shared){
 const [zoom,setZoom]=useState(0);
 const safetyStops=[{x:21,y:68,name:'Trailhead'},{x:43,y:48,name:'Ridge marker'},{x:67,y:39,name:'Current location'},{x:82,y:68,name:'Lookout'}];
 return <div className="page-content animate-in">
  <PageHead eyebrow="ROUTE CONTEXT  /  ILLUSTRATIVE" title="Trail map" description="A sample route visualization for the project demo. Map geometry and coordinates are not live GPS." action={<DemoTag/>}/>
  <div className="map-toolbar"><div className="route-title"><span className="route-emblem"><Mountain size={18}/></span><div><strong>North Ridge Loop</strong><small>Sample trail · route length 6.8 km</small></div></div><div className="map-conditions"><StatusPill label={prediction.label}/><span className="condition-item"><Eye size={14}/>{features.visibilityM} m visibility</span><span className="condition-item"><Wind size={14}/>{features.environmentalCondition}</span></div></div>
  <div className="map-layout"><Card className="map-card"><div className={`map-canvas map-grid zoom-${zoom}`}><div className="map-contours contour-one"/><div className="map-contours contour-two"/><div className="map-contours contour-three"/><div className="map-zone zone-a"/><div className="map-zone zone-b"/>{features.objectCategory==='wildlife'&&<div className="map-area-label wildlife-area-label">WILDLIFE ALERT AREA · DEMO</div>}{prediction.label==='DANGER'&&<div className="map-area-label danger-area-label">DANGER ZONE · SIMULATED</div>}<div className="map-area-label route-area-label">SAFE ROUTE · DEMO ONLY</div><svg className="map-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M21 68 C26 61 30 59 34 62 S40 54 43 48 C47 42 49 50 54 47 S62 35 67 39 C72 42 75 54 82 68" fill="none" stroke="rgba(79,197,211,.14)" strokeWidth="5" strokeLinecap="round"/><path className="route-line" d="M21 68 C26 61 30 59 34 62 S40 54 43 48 C47 42 49 50 54 47 S62 35 67 39 C72 42 75 54 82 68" fill="none" stroke="#4ec5d3" strokeWidth="1.15" strokeLinecap="round"/></svg>{safetyStops.map((p,i)=><div key={p.name} className={`map-pin pin-${i}`} style={{left:`${p.x}%`,top:`${p.y}%`}}><span className="pin-pulse"/><span className="pin-dot"/><label>{p.name}</label></div>)}<div className="map-north">N <ArrowUpRight size={15}/></div><div className="map-zoom"><button aria-label="Zoom in" onClick={()=>setZoom(v=>Math.min(2,v+1))}>+</button><button aria-label="Zoom out" onClick={()=>setZoom(v=>Math.max(0,v-1))}>−</button></div><div className="map-legend"><span><i className="legend-route"/>Illustrative route</span><span><i className="legend-current"/>Current position · simulated</span></div><div className="map-coordinate mono">47.421° N &nbsp; 121.713° W <b>DEMO COORDINATES</b></div></div></Card>
   <aside className="map-side"><Card className="route-card"><div className="eyebrow">ROUTE SUMMARY</div><h3>North Ridge Loop</h3><p>Illustrative trail path for the TrekSafe project presentation.</p><div className="route-stats"><div><strong>6.8</strong><small>KM DISTANCE</small></div><div><strong>+420</strong><small>METERS GAIN</small></div><div><strong>3h 20m</strong><small>EST. DURATION</small></div></div><div className="route-condition"><span>Trail assessment</span><StatusPill label={prediction.label}/></div>{running?<Button onClick={finishTrip} className="full-button"><Check size={15}/> Finish demo trip</Button>:<Button onClick={()=>setRunning(true)} className="full-button"><Play size={15}/> Start demo trip</Button>}<span className="map-elapsed">{running?`Session elapsed · ${formatTime(elapsed)}`:'Session can be completed from the overview.'}</span></Card>
    <Card className="map-alert-card"><span className={`mini-alert-icon ${labelColor[prediction.label]}`}><AlertTriangle size={16}/></span><div><strong>Terrain awareness</strong><p>{prediction.reasons?.[0]||'Conditions are represented with illustrative map markers only.'}</p></div></Card>
   </aside></div><div className="map-disclaimer"><Info size={14}/>No real GPS, elevation data, or mapped trail navigation. Coordinates and route are synthetic demo data.</div>
 </div>;
}
function Analysis({features,prediction,trips}:Shared){
 const max=Math.max(...Object.values(prediction.voteShares));
 const rows=[['SAFE',prediction.voteShares.SAFE,'#50c694'],['CAUTION',prediction.voteShares.CAUTION,'#e6b965'],['DANGER',prediction.voteShares.DANGER,'#ee756b']] as const;
  const signalRows=[{name:'Object distance',value:features.objectDistanceM,unit:'m',score:Math.max(0,100-features.objectDistanceM)},{name:'Slope',value:features.slopeDegrees,unit:'°',score:Math.min(100,features.slopeDegrees*2)},{name:'Visibility',value:features.visibilityM,unit:'m',score:Math.max(0,100-features.visibilityM/3)},{name:'Obstacle density',value:features.obstacleDensity,unit:'%',score:features.obstacleDensity},{name:'Temperature',value:features.temperatureC,unit:'°C',score:features.temperatureC<0||features.temperatureC>35?80:10}];
 const detectionCount=trips.reduce((sum,t)=>sum+t.detectionCount,0);
 const wildlifeCount=trips.reduce((sum,t)=>sum+t.wildlifeAlerts,0);
 const obstacleCount=trips.reduce((sum,t)=>sum+t.obstacleAlerts,0);
 const dangerEvents=trips.filter(t=>t.maxRisk==='DANGER').length;
 const averageDetectionDistance=detectionCount?trips.reduce((sum,t)=>sum+t.averageDetectionDistance*t.detectionCount,0)/detectionCount:0;
 const safetyScore=trips.length?Math.round(trips.reduce((sum,t)=>sum+t.safetyScore,0)/trips.length):Math.round(100*(prediction.voteShares.SAFE+prediction.voteShares.CAUTION*.65+prediction.voteShares.DANGER*.15));
 const riskCounts={SAFE:trips.filter(t=>t.maxRisk==='SAFE').length,CAUTION:trips.filter(t=>t.maxRisk==='CAUTION').length,DANGER:trips.filter(t=>t.maxRisk==='DANGER').length};
 const riskTotal=trips.length||1;
 return <div className="page-content animate-in"><PageHead eyebrow="MODEL INTERPRETATION  /  LOCAL DEMO" title="Analysis & prediction" description="Explore the current synthetic model output, its contributing factors, and the limits of this proof of concept." action={<DemoTag/>}/>
  <div className="analysis-summary"><Card className="analysis-feature"><div className="analysis-feature-head"><span className={`analysis-icon ${labelColor[prediction.label]}`}>{prediction.label==='SAFE'?<ShieldCheck size={22}/>:<AlertTriangle size={22}/>}</span><div><div className="eyebrow">CURRENT PREDICTION</div><h2>{prediction.label}</h2></div><span className="analysis-mode">SYNTHETIC MODEL</span></div><p>{prediction.reasons?.[0]||'The current scenario is evaluated using demo sensor feature values.'}</p><div className="analysis-score"><span>Winning tree vote share</span><strong>{(prediction.confidence*100).toFixed(1)}<small>%</small></strong></div><Meter value={prediction.confidence*100} color={labelColor[prediction.label]}/></Card>
   <Card className="probability-card"><div className="eyebrow">TREE VOTE SHARES</div><h3>Prediction distribution</h3><div className="probability-bars">{rows.map(([name,value,color])=><div className="distribution-row" key={name}><div className="distribution-head"><span>{name}</span><strong>{(value*100).toFixed(1)}%</strong></div><div className="distribution-track"><span style={{width:`${value*100}%`,backgroundColor:color}}/></div></div>)}</div><div className="winning-class"><CheckCircle2 size={14}/>Top vote <strong>{rows.find(([,v])=>v===max)?.[0]}</strong></div></Card>
  </div>
  <div className="analysis-grid"><Card><div className="section-heading"><div><div className="eyebrow">INPUT FEATURE REVIEW</div><h3>Signals in this prediction</h3></div><span className="demo-inline">SYNTHETIC INPUTS</span></div><p className="section-sub">These features are manually generated simulation values, not readings from connected sensors.</p><div className="signals">{signalRows.map(s=><div className="signal-row" key={s.name}><div className="signal-name"><strong>{s.name}</strong><span>{s.value}{s.unit}</span></div><Meter value={s.score} color={s.score>70?'caution':'cyan'}/><span className="signal-impact">{s.score>70?'Elevated':'Nominal'}</span></div>)}</div><div className="feature-chips"><span>Terrain: <b>{features.terrainType}</b></span><span>Object: <b>{features.objectCategory}</b></span><span>Conditions: <b>{features.environmentalCondition}</b></span><span>Animal proximity: <b>{features.animalProximity?'Yes':'No'}</b></span></div></Card>
   <Card className="model-info-card"><div className="info-symbol"><Sparkles size={19}/></div><div className="eyebrow">ABOUT THIS MODEL</div><h3>Proof of concept, not a field tool.</h3><p>This synthetic model demonstrates how multiple trail features could inform a safety classification. It is not trained or validated for real-world wildlife, terrain, or emergency decisions.</p><div className="model-limit"><TriangleAlert size={15}/><span>Do not use predictions to make real trekking safety decisions. Always rely on local guidance and your own judgment.</span></div><Link href="/detection" className="text-link">Explore simulated inputs <ArrowRight size={14}/></Link></Card>
  </div>
  <section className="analytics-section"><div className="analytics-section-head"><div><div className="eyebrow">TRIP ANALYTICS  /  DEMO DATA</div><h2>Safety outcomes across saved trips</h2><p>All values summarize simulated sessions stored in this browser.</p></div><span className="demo-tag"><span className="demo-dot"/>ILLUSTRATIVE ONLY</span></div>
   <div className="analytics-metrics">
    <Metric icon={<ShieldCheck size={16}/>} label="AVERAGE SAFETY SCORE" value={`${safetyScore}/100`} foot="Illustrative trip score" accent="cyan"/>
    <Metric icon={<Activity size={16}/>} label="DETECTION COUNT" value={String(detectionCount)} foot="Wildlife + obstacle demo events" accent="blue"/>
    <Metric icon={<Eye size={16}/>} label="WILDLIFE DETECTIONS" value={String(wildlifeCount)} foot="Simulated wildlife events" accent="amber"/>
    <Metric icon={<TriangleAlert size={16}/>} label="OBSTACLE COUNT" value={String(obstacleCount)} foot="Simulated obstacle events" accent="blue"/>
    <Metric icon={<AlertTriangle size={16}/>} label="DANGER EVENTS" value={String(dangerEvents)} foot="Trips reaching DANGER" accent="amber"/>
    <Metric icon={<Navigation size={16}/>} label="AVG DETECTION DISTANCE" value={detectionCount?`${averageDetectionDistance.toFixed(0)} m`:'—'} foot="Across demo detections" accent="cyan"/>
   </div>
   <div className="analytics-bottom"><Card className="risk-distribution-card"><div className="section-heading"><div><div className="eyebrow">TRIP RISK DISTRIBUTION</div><h3>Maximum predicted risk by trip</h3></div><span className="demo-inline">{trips.length} SAVED TRIPS</span></div><div className="risk-stack" aria-label={`Risk distribution: ${riskCounts.SAFE} safe, ${riskCounts.CAUTION} caution, ${riskCounts.DANGER} danger trips`}><span className="risk-safe" style={{width:`${riskCounts.SAFE/riskTotal*100}%`}}/><span className="risk-caution" style={{width:`${riskCounts.CAUTION/riskTotal*100}%`}}/><span className="risk-danger" style={{width:`${riskCounts.DANGER/riskTotal*100}%`}}/></div><div className="risk-legend"><span><i className="risk-safe"/>SAFE <b>{riskCounts.SAFE}</b></span><span><i className="risk-caution"/>CAUTION <b>{riskCounts.CAUTION}</b></span><span><i className="risk-danger"/>DANGER <b>{riskCounts.DANGER}</b></span></div></Card>
    <Card className="dataset-card"><div className="eyebrow">SYNTHETIC TRAINING DATASET</div><h3>Model snapshot</h3><div className="dataset-stats"><div><strong>{SYNTHETIC_DATASET_INFO.samples}</strong><span>generated samples</span></div><div><strong>{SYNTHETIC_DATASET_INFO.featureCount}</strong><span>input features</span></div><div><strong>{SYNTHETIC_DATASET_INFO.algorithm.split('(')[0].trim()}</strong><span>classifier</span></div><div><strong>13</strong><span>decision trees</span></div></div><p>Generated examples and model vote shares are for demonstration only; they are not measured wildlife-detection statistics or calibrated probabilities.</p></Card></div>
  </section>
  <LimitNote/>
 </div>;
}
function Devices({deviceConnected,setDeviceConnected,prefs,setPrefs,triggerFeedback}:Shared){
 const [scanDone,setScanDone]=useState(false);
 const toggle=()=>{const next=!deviceConnected;setDeviceConnected(next);setScanDone(true);};
 return <div className="page-content animate-in"><PageHead eyebrow="COMPANION HARDWARE  /  ROADMAP" title="Glasses connection" description="Preview the intended companion-device workflow. There is no physical glasses hardware connected in this demo." action={<DemoTag/>}/>
  <div className="device-hero"><Card className="device-panel"><div className="device-panel-head"><div><div className="eyebrow">DEVICE STATUS</div><h2>{deviceConnected?'Demo device paired':'No device connected'}</h2><p>{deviceConnected?'A simulated connection is active for this session.':'Pairing is visual only and does not connect to hardware.'}</p></div><div className={`device-art ${deviceConnected?'device-art-on':''}`}><Glasses size={49} strokeWidth={1.25}/><span className="lens-glint"/></div></div><div className="device-state-bar"><span className={`connection-state ${deviceConnected?'paired':''}`}><span/>{deviceConnected?'SIMULATED PAIRING':'NOT CONNECTED'}</span><span className="device-protocol">DEMO MODE · LOCAL ONLY</span></div>{scanDone&&<div className="scan-feedback">{deviceConnected?<CheckCircle2 size={16}/>:<Radio size={16}/>} {deviceConnected?'Demo pairing enabled. No wireless connection was made.':'Scan complete — no real glasses hardware available.'}</div>}<div className="device-actions"><Button onClick={toggle}>{deviceConnected?<><X size={15}/> Disconnect demo device</>:<><Wifi size={15}/> Simulate pairing</>}</Button><Button variant="outline" onClick={triggerFeedback}><Vibrate size={15}/>Test vibration feedback</Button></div></Card>
   <Card className="device-controls"><div className="eyebrow">FEEDBACK PREFERENCES</div><h3>How TrekSafe responds</h3><PreferenceToggle icon={<Bell size={16}/>} title="On-screen safety alerts" detail="Show local alerts when a simulated scenario needs attention." checked={prefs.alerts} onChange={v=>setPrefs({...prefs,alerts:v})}/><PreferenceToggle icon={<Vibrate size={16}/>} title="Vibration simulation" detail="Display an acknowledgement when a haptic alert is triggered." checked={prefs.vibration} onChange={v=>setPrefs({...prefs,vibration:v})}/></Card>
  </div>
  <Card className="sensor-status-card"><div className="section-heading"><div><div className="eyebrow">TREKSAFE GLASSES · DEVICE PREVIEW</div><h3>Sensor and connection status</h3></div><DemoTag/></div><p className="section-sub">Every status below is simulated. The current app has no camera stream, thermal hardware, proximity sensor, or glasses connection.</p><div className="device-sensor-grid">{[
   {name:'Optical camera',status:'SIMULATED ONLINE',detail:'No camera access used',icon:<Eye size={16}/>},
   {name:'Thermal / infrared',status:'SIMULATED · FUTURE',detail:'No thermal hardware present',icon:<Thermometer size={16}/>},
   {name:'Distance sensor',status:'SIMULATED ONLINE',detail:'Demo distance values only',icon:<Navigation size={16}/>},
   {name:'Motion / orientation',status:'SIMULATED ONLINE',detail:'No motion sensors accessed',icon:<Compass size={16}/>},
   {name:'Battery',status:'86% · DEMO',detail:'Illustrative battery reading',icon:<Gauge size={16}/>},
   {name:'Wireless signal',status:deviceConnected?'GOOD · SIMULATED':'DISCONNECTED',detail:deviceConnected?'No wireless radio is active':'Turn on simulated pairing above',icon:<Radio size={16}/>},
  ].map(item=><div className="device-sensor-item" key={item.name}><span>{item.icon}</span><div><strong>{item.name}</strong><small>{item.detail}</small></div><b>{item.status}</b></div>)}</div></Card>
  <Card className="architecture-card"><div className="section-heading"><div><div className="eyebrow">FUTURE SYSTEM ARCHITECTURE</div><h3>From trail signal to user feedback</h3></div><span className="roadmap-tag">PLANNED HARDWARE PATH</span></div><p className="section-sub">The intended architecture is a future direction for the project. The app currently simulates the complete flow.</p><div className="architecture-flow">{[
   {n:'01',title:'Glasses',detail:'Wearable platform',icon:<Glasses size={18}/>},{n:'02',title:'Sensors',detail:'Camera + future thermal / infrared + environmental sensors',icon:<Eye size={18}/>},{n:'03',title:'Edge processing',detail:'On-device feature extraction',icon:<Activity size={18}/>},{n:'04',title:'Wireless',detail:'Future data link',icon:<Radio size={18}/>},{n:'05',title:'Mobile app',detail:'TrekSafe companion',icon:<Smartphone size={18}/>},{n:'06',title:'ML analysis',detail:'Safety assessment',icon:<Sparkles size={18}/>},{n:'07',title:'User alert',detail:'Visual notification',icon:<Bell size={18}/>},{n:'08',title:'Glasses vibration',detail:'Future haptic feedback',icon:<Vibrate size={18}/>},
  ].map((item,i)=><div className="architecture-step" key={item.n}><span className="architecture-icon">{item.icon}</span><span className="architecture-num">{item.n}</span><strong>{item.title}</strong><small>{item.detail}</small>{i<7&&<ArrowRight className="architecture-arrow" size={13}/>}</div>)}</div><div className="architecture-disclaimer"><Info size={14}/>Thermal/infrared sensing, smart-glasses wireless communication, and glasses vibration are future hardware plans, not phone features.</div></Card>
  <div className="device-note"><CircleHelp size={16}/><span><strong>Prototype boundary</strong> — This interface does not access your phone camera, microphone, GPS, Bluetooth, or environmental sensors.</span></div>
 </div>;
}
function PreferenceToggle({icon,title,detail,checked,onChange}:{icon:ReactNode;title:string;detail:string;checked:boolean;onChange:(v:boolean)=>void}){return <label className="preference-row"><span className="preference-icon">{icon}</span><span className="preference-copy"><strong>{title}</strong><small>{detail}</small></span><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/><i className="switch-ui"/></label>}
function History({trips,setTrips}:{trips:Trip[];setTrips:(f:(prev:Trip[])=>Trip[])=>void}){
 const [confirm,setConfirm]=useState(false);
 const averageSafetyScore=trips.length?Math.round(trips.reduce((sum,t)=>sum+t.safetyScore,0)/trips.length):0;
 const download=()=>{const blob=new Blob([JSON.stringify(trips,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='treksafe-demo-trips.json';a.click();URL.revokeObjectURL(a.href);};
 return <div className="page-content animate-in"><PageHead eyebrow="LOCAL SESSION LOG  /  PRIVATE TO THIS DEVICE" title="Trip history" description="Completed simulated trips are saved in this browser only. No data is uploaded." action={<div className="history-actions"><Button variant="outline" onClick={download} disabled={!trips.length}><Download size={15}/> Export</Button>{trips.length>0&&<Button variant="quiet" onClick={()=>setConfirm(true)}>Clear history</Button>}</div>}/>
  <div className="history-summary"><Metric icon={<RouteIcon size={16}/>} label="SAVED TRIPS" value={String(trips.length)} foot="Stored in local browser storage" accent="cyan"/><Metric icon={<Footprints size={16}/>} label="TOTAL DEMO DISTANCE" value={`${trips.reduce((sum,t)=>sum+t.distance,0).toFixed(1)} km`} foot="Illustrative simulated distance" accent="blue"/><Metric icon={<Timer size={16}/>} label="TIME ON TRAIL" value={formatTime(trips.reduce((sum,t)=>sum+t.duration,0))} foot="Across saved demo sessions" accent="amber"/><Metric icon={<ShieldCheck size={16}/>} label="AVG SAFETY SCORE" value={`${averageSafetyScore}/100`} foot="Illustrative model-derived score" accent="cyan"/></div>
  <Card className="history-list-card"><div className="section-heading"><div><div className="eyebrow">SESSION RECORDS</div><h3>Saved trips</h3></div><span className="demo-inline">LOCAL DEMO DATA</span></div>{trips.length?<div className="history-table"><div className="history-table-head"><span>TRIP NAME</span><span>DATE</span><span>DISTANCE</span><span>DURATION</span><span>MAX RISK</span><span>ALERTS W / T / O</span><span>AVG SCORE</span></div>{trips.map(t=><div className="history-table-row" key={t.id}><span className="trip-name"><span className="trip-mini-icon"><Mountain size={15}/></span><span><strong>{t.name}</strong><small>{t.scenario} · simulated</small></span></span><span>{new Date(t.date).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span><span>{t.distance.toFixed(1)} km</span><span>{formatTime(t.duration)}</span><span><StatusPill label={t.maxRisk}/></span><span className="trip-alert-counts">W {t.wildlifeAlerts} · T {t.terrainAlerts} · O {t.obstacleAlerts}</span><span>{t.safetyScore}/100</span></div>)}</div>:<div className="history-empty"><span className="history-empty-icon"><Footprints size={24}/></span><h3>No trips saved yet</h3><p>Start and finish a simulated trail session to see it appear here. Your history stays in this browser.</p><Link href="/" className="button button-primary">Go to overview <ArrowRight size={15}/></Link></div>}<div className="history-disclaimer"><Info size={13}/>Risk levels, alerts, distances, and scores are synthetic session summaries, not real-world records.</div></Card>
  {confirm&&<div className="modal-backdrop" role="presentation" onClick={()=>setConfirm(false)}><div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="clear-title" onClick={e=>e.stopPropagation()}><span className="confirm-icon"><AlertTriangle size={18}/></span><h3 id="clear-title">Clear trip history?</h3><p>This permanently removes {trips.length} locally saved demo {trips.length===1?'trip':'trips'} from this browser.</p><div><Button variant="quiet" onClick={()=>setConfirm(false)}>Keep history</Button><Button variant="danger" onClick={()=>{setTrips(()=>[]);setConfirm(false);}}>Clear trips</Button></div></div></div>}
 </div>;
}
function Settings({prefs,setPrefs}:Shared){
 const [saved,setSaved]=useState(false);
 const update=(p:Preferences)=>{setPrefs(p);setSaved(true);window.setTimeout(()=>setSaved(false),1800);};
 return <div className="page-content animate-in"><PageHead eyebrow="YOUR DEMO ENVIRONMENT" title="Settings" description="Tune local prototype behavior. Your preferences persist in this browser." action={<span className={`save-status ${saved?'save-visible':''}`}><Check size={14}/> Saved locally</span>}/>
  <div className="settings-layout"><div className="settings-main"><Card className="settings-card"><div className="section-heading"><div><div className="eyebrow">ALERT PREFERENCES</div><h3>Safety feedback</h3></div><Bell size={18} className="settings-heading-icon"/></div><PreferenceToggle icon={<Bell size={16}/>} title="On-screen alerts" detail="Show a notice when the model returns CAUTION or DANGER for a chosen scenario." checked={prefs.alerts} onChange={v=>update({...prefs,alerts:v})}/><PreferenceToggle icon={<Vibrate size={16}/>} title="Vibration simulation" detail="Allow the prototype to show haptic feedback confirmation." checked={prefs.vibration} onChange={v=>update({...prefs,vibration:v})}/></Card>
  <Card className="settings-card"><div className="section-heading"><div><div className="eyebrow">DISPLAY & ACCESSIBILITY</div><h3>Units and thresholds</h3></div><SlidersHorizontal size={18} className="settings-heading-icon"/></div><label className="settings-select"><span><strong>Distance units</strong><small>Saved preference; model inputs remain in metric units.</small></span><select value={prefs.units} onChange={e=>update({...prefs,units:e.target.value as Preferences['units']})}><option value="metric">Metric (m, km, °C)</option><option value="imperial">Imperial (ft, mi, °F)</option></select></label><div className="threshold-control"><div><strong>Alert confidence threshold</strong><small>Display threshold preference · does not change model output.</small></div><div className="threshold-value"><strong>{prefs.confidence}%</strong><input type="range" min={50} max={95} step={5} value={prefs.confidence} onChange={e=>update({...prefs,confidence:Number(e.target.value)})}/></div></div></Card>
  <Card className="settings-card"><div className="section-heading"><div><div className="eyebrow">DATA & PRIVACY</div><h3>Local prototype data</h3></div><Shield size={18} className="settings-heading-icon"/></div><div className="privacy-row"><span className="privacy-check"><Check size={15}/></span><span><strong>Stored only in this browser</strong><small>Trip history and preferences use localStorage. Nothing is sent to a server.</small></span></div><div className="privacy-row"><span className="privacy-check"><Check size={15}/></span><span><strong>No device permissions requested</strong><small>This prototype does not access camera, location, Bluetooth, or phone sensors.</small></span></div></Card></div>
  <aside className="settings-aside"><Card className="settings-info"><div className="info-symbol"><Info size={18}/></div><div className="eyebrow">PROJECT CONTEXT</div><h3>Research prototype</h3><p>TrekSafe AI is an educational proof of concept that explores how synthetic trail conditions could inform a risk classification.</p><div className="settings-facts"><span>Build</span><strong>Demo · v0.8</strong><span>Runtime</span><strong>Browser only</strong><span>Model</span><strong>Synthetic</strong></div></Card><div className="settings-warning"><AlertTriangle size={16}/><p><strong>Not for real-world safety decisions.</strong> This model has not been validated on trail data and does not detect wildlife.</p></div></aside></div>
 </div>;
}
function TripRow({trip}:{trip:Trip}){return <div className="activity-row"><span className="activity-icon"><Mountain size={14}/></span><span className="activity-copy"><strong>{trip.name}</strong><small>{new Date(trip.date).toLocaleDateString()}</small></span><StatusPill label={trip.label}/></div>}
function LimitNote(){return <div className="limit-note"><span><Info size={14}/></span><p><strong>Proof-of-concept limitation</strong> — TrekSafe AI currently uses synthetic inputs and an unvalidated model. It does not perform real-time animal detection, use phone sensors, or provide certified safety advice.</p><Link href="/analysis">Model limitations <ArrowRight size={13}/></Link></div>}
function NotFound(){return <div className="page-content not-found"><div className="eyebrow">404 · ROUTE NOT FOUND</div><h1>This trail ends here.</h1><p>That page isn't part of this prototype.</p><Link href="/" className="button button-primary"><ArrowLeft size={15}/> Back to overview</Link></div>}
function formatTime(total:number){const h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;return h?`${h}h ${String(m).padStart(2,'0')}m`:`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}

export default App;
