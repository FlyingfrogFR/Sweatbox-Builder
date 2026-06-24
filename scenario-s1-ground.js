// scenario-s1-ground.js
// S1 Ground scenario generator for LFLL, LFBO, LFML.
//
// Stand source precedence (per airport):
//   1. RampAgent — wingspan + ICAO code letter aware. Aircraft are matched to
//      stands that physically fit them; airline callsigns boost matching to
//      preferred stands; Block constraints are respected for simultaneous
//      occupancy at T0.
//   2. ESE [FREETEXT] gates — coordinates only, no fitness check.
//   3. Hardcoded fallback stands in this file.
//
// Routes are pulled from the Aircraft Pool when an entry matches origin (for
// departures) or dest (for arrivals). When the pool has no match, a placeholder
// route is generated so fpRoute/simRoute are never blank.
//
// Aircraft schema is identical to v5's emptyAc() — `groundMeta` is the only
// extra field, ignored by the existing Scenario / Export panels.
//
// Loaded via <script type="text/babel" data-presets="react"> so JSX is OK.
(function(){
  const SB=window.SB;
  const { React,useState,useEffect,useMemo,
          Icon,uid,emptyAc,
          genCS,SRC_LABELS,
          pickStand,standFitsType,aircraftFootprint } = SB;

  // ───────────────────────────────────────────────────────────────────────
  // Per-airport scenario data (runways, exits, VFR neighbours).
  // Stand data here is the LAST-RESORT fallback only — RampAgent supersedes
  // it when loaded, and ESE [FREETEXT] gates supersede the hardcoded list.
  // ───────────────────────────────────────────────────────────────────────
  const AIRPORTS={
    LFLL:{
      name:'Lyon Saint-Exupéry',icao:'LFLL',elevation:821,
      runways:['35L','35R','17L','17R'],
      defaultDepRwy:'35R',defaultArrRwy:'35L',
      fallbackStands:[
        {label:'A1',lat:45.7242,lon:5.0890},{label:'A2',lat:45.7247,lon:5.0892},
        {label:'A3',lat:45.7252,lon:5.0894},{label:'B1',lat:45.7242,lon:5.0908},
        {label:'B2',lat:45.7247,lon:5.0910},{label:'B3',lat:45.7252,lon:5.0912},
        {label:'C1',lat:45.7237,lon:5.0922},{label:'C2',lat:45.7242,lon:5.0924},
        {label:'GA1',lat:45.7220,lon:5.0935},{label:'GA2',lat:45.7223,lon:5.0938},
      ],
      rwyExits:{
        '35L':{lat:45.7295,lon:5.0855,gs:30},'35R':{lat:45.7298,lon:5.0950,gs:30},
        '17L':{lat:45.7155,lon:5.0950,gs:30},'17R':{lat:45.7152,lon:5.0855,gs:30},
      },
      vfrNearby:['LFLY','LFLB','LFHP'],
    },
    LFBO:{
      name:'Toulouse-Blagnac',icao:'LFBO',elevation:499,
      runways:['14L','14R','32L','32R'],
      defaultDepRwy:'14R',defaultArrRwy:'14L',
      fallbackStands:[
        {label:'A1',lat:43.6330,lon:1.3680},{label:'A2',lat:43.6334,lon:1.3683},
        {label:'A3',lat:43.6338,lon:1.3686},{label:'B1',lat:43.6325,lon:1.3695},
        {label:'B2',lat:43.6329,lon:1.3698},{label:'B3',lat:43.6333,lon:1.3701},
        {label:'C1',lat:43.6320,lon:1.3712},{label:'C2',lat:43.6324,lon:1.3715},
        {label:'GA1',lat:43.6310,lon:1.3725},{label:'GA2',lat:43.6313,lon:1.3728},
      ],
      rwyExits:{
        '14L':{lat:43.6370,lon:1.3700,gs:30},'14R':{lat:43.6360,lon:1.3680,gs:30},
        '32L':{lat:43.6240,lon:1.3550,gs:30},'32R':{lat:43.6230,lon:1.3530,gs:30},
      },
      vfrNearby:['LFCL','LFBF','LFDB'],
    },
    LFML:{
      name:'Marseille-Provence',icao:'LFML',elevation:73,
      runways:['13L','13R','31L','31R'],
      defaultDepRwy:'31R',defaultArrRwy:'31L',
      fallbackStands:[
        {label:'A1',lat:43.4435,lon:5.2150},{label:'A2',lat:43.4439,lon:5.2153},
        {label:'A3',lat:43.4443,lon:5.2156},{label:'B1',lat:43.4430,lon:5.2168},
        {label:'B2',lat:43.4434,lon:5.2171},{label:'B3',lat:43.4438,lon:5.2174},
        {label:'C1',lat:43.4425,lon:5.2185},{label:'C2',lat:43.4429,lon:5.2188},
        {label:'GA1',lat:43.4415,lon:5.2200},{label:'GA2',lat:43.4418,lon:5.2203},
      ],
      rwyExits:{
        '13L':{lat:43.4470,lon:5.2080,gs:30},'13R':{lat:43.4465,lon:5.2095,gs:30},
        '31L':{lat:43.4395,lon:5.2270,gs:30},'31R':{lat:43.4390,lon:5.2285,gs:30},
      },
      vfrNearby:['LFMQ','LFTH','LFNH'],
    },
  };

  const IFR_TYPES=['A320','A321','A20N','A319','B738','E190','E195','AT76','CRJ9','A21N'];
  const VFR_TYPES=['C172','C152','PA28','DR40','TB20','BE36','SR22','SR20','DA40','C182'];
  const VFR_PFX=['F-G','F-H','F-B','D-E','HB-','OO-'];
  const DOMESTIC_DESTS=['LFPG','LFPO','LFML','LFLL','LFMN','LFBO','LFBD','LFRS','LFST','EGLL','EHAM','EDDF','LIRF','LEMD'];

  function defaultGroundConfig(){
    const apt=AIRPORTS.LFLL;
    return{
      mode:'S1',
      airport:'LFLL',
      depRwy:apt.defaultDepRwy,
      arrRwy:apt.defaultArrRwy,
      total:12,
      initialPopulated:4,
      sessionLen:30,
      vfrCount:2,
      depRatio:0.8,
      minArrSpacing:3.0,
      twoGateSpacing:false,
    };
  }

  function genVfrCs(used){
    for(let t=0;t<60;t++){
      const pfx=VFR_PFX[Math.floor(Math.random()*VFR_PFX.length)];
      const tail=String.fromCharCode(65+Math.floor(Math.random()*26))+
                 String.fromCharCode(65+Math.floor(Math.random()*26))+
                 String.fromCharCode(65+Math.floor(Math.random()*26));
      const cs=pfx+tail;
      if(!used.has(cs)){used.add(cs);return cs;}
    }
    const fb=VFR_PFX[0]+Date.now().toString(36).slice(-3).toUpperCase();
    used.add(fb);return fb;
  }
  const pickArr=(arr,i)=>arr[i%arr.length];
  const pickRand=arr=>arr[Math.floor(Math.random()*arr.length)];

  // Resolve which stand source to use for a given airport.
  // Returns { source: 'rampagent'|'ese'|'fallback', stands, supportsFitness }
  function resolveStandSource(apt,gates,rampAgent){
    const ra=rampAgent?.[apt.icao];
    if(ra&&ra.stands&&ra.stands.length){
      return{source:'rampagent',stands:ra.stands,supportsFitness:true};
    }
    const eseGates=(gates||[]).filter(g=>g.icao===apt.icao);
    if(eseGates.length){
      return{
        source:'ese',
        stands:eseGates.map(g=>({label:g.label,lat:g.lat,lon:g.lon,code:null,wingspan:null,use:null,priority:5,callsigns:[],block:[],remark:null})),
        supportsFitness:false,
      };
    }
    return{
      source:'fallback',
      stands:apt.fallbackStands.map(s=>({label:s.label,lat:s.lat,lon:s.lon,code:null,wingspan:null,use:null,priority:5,callsigns:[],block:[],remark:null})),
      supportsFitness:false,
    };
  }

  // Pick a stand for an aircraft. Uses RampAgent fitness checks when available,
  // otherwise round-robins through whatever list we have.
  // Returns { stand, reason } where reason is 'fit' | 'no-fit' | 'roundrobin'
  //
  // When `twoHop` is true and stand data has Block info, we expand the
  // occupied set by one extra hop: any stand whose Block list intersects
  // already-occupied stands becomes itself off-limits. This implements the
  // "always 2 gates apart" option — at least one empty stand between any
  // two spawned aircraft, using RampAgent's adjacency topology.
  function pickStandForAircraft(standCtx,type,callsignPrefix,useFilter,occupied,fallbackIdx,twoHop){
    if(standCtx.supportsFitness){
      let occ=occupied;
      if(twoHop&&occupied.size>0){
        occ=new Set(occupied);
        // For each currently occupied stand, look at its Block list; for each
        // of those, look at THEIR Block lists, and add to the exclude set.
        const standByLabel=new Map(standCtx.stands.map(s=>[s.label,s]));
        for(const lbl of occupied){
          const s=standByLabel.get(lbl);
          if(!s)continue;
          for(const b of s.block){
            occ.add(b);
            const bs=standByLabel.get(b);
            if(!bs)continue;
            for(const bb of bs.block)occ.add(bb);
          }
        }
      }
      const stand=pickStand(standCtx.stands,type,{occupied:occ,callsignPrefix,useFilter});
      if(stand)return{stand,reason:'fit'};
      return{stand:null,reason:'no-fit'};
    }
    // No fitness data — round-robin, but still respect occupancy so we don't
    // park two aircraft on the same fallback stand.
    if(occupied.size>=standCtx.stands.length)return{stand:null,reason:'no-fit'};
    let idx=fallbackIdx%standCtx.stands.length;
    let probes=0;
    while(occupied.has(standCtx.stands[idx].label)&&probes<standCtx.stands.length){
      idx=(idx+1)%standCtx.stands.length;
      probes++;
    }
    if(probes>=standCtx.stands.length)return{stand:null,reason:'no-fit'};
    return{stand:standCtx.stands[idx],reason:'roundrobin'};
  }

  // ───────────────────────────────────────────────────────────────────────
  // Generation
  // ───────────────────────────────────────────────────────────────────────
  function buildGroundAircraft(cfg,gates,pool,rampAgent){
    const apt=AIRPORTS[cfg.airport];
    const warnings=[],errors=[];
    if(!apt){return{aircraft:[],warnings,errors:['Unknown airport: '+cfg.airport]};}

    const total=Math.max(0,+cfg.total||0);
    const sessionLen=Math.max(1,+cfg.sessionLen||30);
    const vfrCount=Math.max(0,+cfg.vfrCount||0);
    const depRatio=Math.max(0,Math.min(1,+cfg.depRatio||0.8));
    const minSpacing=Math.max(0,+cfg.minArrSpacing||0);
    const ifrTotal=Math.max(0,total-vfrCount);
    const numDep=Math.round(ifrTotal*depRatio);
    const numArr=ifrTotal-numDep;

    const initialReq=Math.max(0,+cfg.initialPopulated||0);
    const initialDepCount=Math.min(initialReq,numDep);
    if(initialReq>numDep){
      warnings.push(`Initial population reduced from ${initialReq} to ${numDep} (only departures pre-populate gates).`);
    }
    const sessionDepCount=numDep-initialDepCount;

    if(numArr>0&&minSpacing>0&&numArr*minSpacing>sessionLen){
      warnings.push(`${numArr} arrivals × ${minSpacing} min spacing = ${(numArr*minSpacing).toFixed(1)} min, exceeds session length ${sessionLen} min — last arrivals will overflow the session window.`);
    }

    if(cfg.mode==='S2'){
      warnings.push('S2 Tower mode is not yet implemented — generating S1 ground traffic only.');
    }

    // Pool filtering — pull routes/types/dests from matching pool entries.
    const poolDeps=(pool||[]).filter(p=>p.origin===apt.icao&&p.route);
    const poolArrs=(pool||[]).filter(p=>p.dest===apt.icao&&p.route);
    const pickDepTmpl=i=>poolDeps.length>0?poolDeps[i%poolDeps.length]:null;
    const pickArrTmpl=i=>poolArrs.length>0?poolArrs[i%poolArrs.length]:null;
    let usedPoolDeps=0,usedPoolArrs=0;

    if(numDep>0&&poolDeps.length===0){
      warnings.push(`No pool departures from ${apt.icao} — generated routes use placeholder "DCT <dest>". Import flights from the Plans tab for realistic routes.`);
    }
    if(numArr>0&&poolArrs.length===0){
      warnings.push(`No pool arrivals to ${apt.icao} — generated routes use placeholder "<origin> DCT". Import flights from the Plans tab for realistic routes.`);
    }

    // Resolve stand source.
    const standCtx=resolveStandSource(apt,gates,rampAgent);
    if(!standCtx.stands.length){
      errors.push(`No stands available for ${apt.icao}.`);
      return{aircraft:[],warnings,errors,standSource:standCtx.source,standCount:0};
    }
    if(standCtx.source==='fallback'){
      warnings.push(`Using ${standCtx.stands.length} hardcoded fallback stands for ${apt.icao}. Load RampAgent JSON for realistic stand assignment.`);
    }
    if(standCtx.source==='ese'){
      warnings.push(`Using ${standCtx.stands.length} ESE-parsed stands for ${apt.icao} — no wingspan/code-letter check. Load RampAgent JSON for fitness-aware assignment.`);
    }
    if(numDep>standCtx.stands.length){
      warnings.push(`Need up to ${numDep} stands but only ${standCtx.stands.length} available — stands will be reused (later session departures will reuse stands vacated by earlier departures).`);
    }

    const depRwyExit=apt.rwyExits[cfg.depRwy]||apt.rwyExits[apt.defaultDepRwy]||Object.values(apt.rwyExits)[0];
    const arrRwyExit=apt.rwyExits[cfg.arrRwy]||apt.rwyExits[apt.defaultArrRwy]||Object.values(apt.rwyExits)[0];
    if(!depRwyExit||!arrRwyExit){
      errors.push('Could not resolve runway exit positions.');
      return{aircraft:[],warnings,errors,standSource:standCtx.source,standCount:standCtx.stands.length};
    }

    const used=new Set();
    const aircraft=[];
    const elev=apt.elevation;
    const meta={source:'S1',mode:cfg.mode,airport:apt.icao,generatedAt:Date.now()};

    // Single occupancy set shared across ALL aircraft that spawn at stands
    // (initial deps, session deps, VFR). Two aircraft cannot spawn at the same
    // stand at the EuroScope spawn instant, regardless of their START times.
    const standOccupied=new Set();
    const twoHop=!!cfg.twoGateSpacing;
    let nofit=0,nofitTypes=new Set();

    // ── Initial departures (already on field at T0) ───────────────────────
    for(let i=0;i<initialDepCount;i++){
      const tmpl=pickDepTmpl(i);
      const dest=tmpl?.dest||pickRand(DOMESTIC_DESTS.filter(d=>d!==apt.icao));
      const type=tmpl?.type||pickArr(IFR_TYPES,i);
      const route=tmpl?.route||`DCT ${dest}`;
      const cruiseAlt=tmpl?.cruiseFL?tmpl.cruiseFL*100:35000;
      const cs=genCS(dest,used,{heavy:false});
      const callsignPrefix=cs.replace(/\d+$/,''); // strip trailing digits

      const{stand,reason}=pickStandForAircraft(standCtx,type,callsignPrefix,'A',standOccupied,i,twoHop);
      if(!stand){nofit++;nofitTypes.add(type);continue;}
      standOccupied.add(stand.label);
      if(tmpl)usedPoolDeps++;
      aircraft.push({
        ...emptyAc(true),
        id:uid(),
        callsign:cs,
        squawk:'2000',
        type,
        origin:apt.icao,
        dest,
        cruiseAlt,
        lat:stand.lat,lon:stand.lon,
        alt:elev,gs:0,
        runway:cfg.depRwy,
        spawnWaypoint:'',preEntryNm:0,
        fpRoute:route,simRoute:route,
        start:Math.round(i*0.3*10)/10,
        isDeparture:true,
        ruleId:null,
        groundMeta:{...meta,kind:'initial-dep',stand:stand.label,routeSource:tmpl?'pool':'placeholder',standMatch:reason},
      });
    }

    // ── Session departures (uniformly distributed across session) ─────────
    // Share the SAME occupancy set as initial deps. EuroScope spawns all
    // aircraft at scenario load (just at different START times), so they all
    // need distinct coordinates from the moment the scenario file is parsed.
    for(let i=0;i<sessionDepCount;i++){
      const tmpl=pickDepTmpl(initialDepCount+i);
      const dest=tmpl?.dest||pickRand(DOMESTIC_DESTS.filter(d=>d!==apt.icao));
      const type=tmpl?.type||pickArr(IFR_TYPES,initialDepCount+i);
      const route=tmpl?.route||`DCT ${dest}`;
      const cruiseAlt=tmpl?.cruiseFL?tmpl.cruiseFL*100:35000;
      const cs=genCS(dest,used,{heavy:false});
      const callsignPrefix=cs.replace(/\d+$/,'');

      const{stand,reason}=pickStandForAircraft(standCtx,type,callsignPrefix,'A',standOccupied,initialDepCount+i,twoHop);
      if(!stand){nofit++;nofitTypes.add(type);continue;}
      standOccupied.add(stand.label);
      const startMin=sessionLen*(i+0.5)/Math.max(sessionDepCount,1);
      if(tmpl)usedPoolDeps++;
      aircraft.push({
        ...emptyAc(true),
        id:uid(),
        callsign:cs,
        squawk:'2000',
        type,
        origin:apt.icao,
        dest,
        cruiseAlt,
        lat:stand.lat,lon:stand.lon,
        alt:elev,gs:0,
        runway:cfg.depRwy,
        spawnWaypoint:'',preEntryNm:0,
        fpRoute:route,simRoute:route,
        start:Math.round(startMin*10)/10,
        isDeparture:true,
        ruleId:null,
        groundMeta:{...meta,kind:'session-dep',stand:stand.label,routeSource:tmpl?'pool':'placeholder',standMatch:reason},
      });
    }

    // ── Session arrivals (uniformly distributed, then forward-pass spaced) ─
    if(numArr>0){
      const arrTimes=[];
      for(let i=0;i<numArr;i++){
        arrTimes.push(sessionLen*(i+0.5)/numArr);
      }
      for(let i=1;i<arrTimes.length;i++){
        if(arrTimes[i]-arrTimes[i-1]<minSpacing){
          arrTimes[i]=arrTimes[i-1]+minSpacing;
        }
      }
      for(let i=0;i<numArr;i++){
        const tmpl=pickArrTmpl(i);
        const origin=tmpl?.origin||pickRand(DOMESTIC_DESTS.filter(d=>d!==apt.icao));
        const type=tmpl?.type||pickArr(IFR_TYPES,i+numDep);
        const route=tmpl?.route||`${origin} DCT`;
        const cruiseAlt=tmpl?.cruiseFL?tmpl.cruiseFL*100:35000;
        if(tmpl)usedPoolArrs++;
        aircraft.push({
          ...emptyAc(false),
          id:uid(),
          callsign:genCS(apt.icao,used,{heavy:false}),
          squawk:'1000',
          type,
          origin,
          dest:apt.icao,
          cruiseAlt,
          lat:arrRwyExit.lat,lon:arrRwyExit.lon,
          alt:elev,gs:arrRwyExit.gs||30,
          runway:cfg.arrRwy,
          spawnWaypoint:'',preEntryNm:0,
          fpRoute:route,simRoute:route,
          start:Math.round(arrTimes[i]*10)/10,
          isDeparture:false,
          ruleId:null,
          groundMeta:{...meta,kind:'session-arr',rwyExit:cfg.arrRwy,routeSource:tmpl?'pool':'placeholder'},
        });
      }
    }

    // ── VFR (half circuit, half local hop) ────────────────────────────────
    const vfrCircuit=Math.ceil(vfrCount/2);
    const vfrLocal=Math.floor(vfrCount/2);
    for(let i=0;i<vfrCircuit+vfrLocal;i++){
      const isCircuit=i<vfrCircuit;
      const type=pickRand(VFR_TYPES);
      const cs=genVfrCs(used);
      const dest=isCircuit?apt.icao:(apt.vfrNearby[i%apt.vfrNearby.length]||apt.icao);
      const route=isCircuit?`${apt.icao}`:`DCT ${dest}`;
      const startMin=sessionLen*(i+0.5)/Math.max(vfrCount,1);

      // VFR prefer 'P' (parking) stands when RampAgent is in use, but fall
      // back to any stand if the typed pool is exhausted. Shares standOccupied
      // with IFR — same physical stand cannot host two aircraft.
      const tryP=pickStandForAircraft(standCtx,type,null,'P',standOccupied,numDep+i,twoHop);
      const stand=tryP.stand||pickStandForAircraft(standCtx,type,null,null,standOccupied,numDep+i,twoHop).stand;
      if(!stand){nofit++;nofitTypes.add(type);continue;}
      standOccupied.add(stand.label);

      aircraft.push({
        ...emptyAc(true),
        id:uid(),
        callsign:cs,
        squawk:'7000',
        type,
        origin:apt.icao,
        dest,
        cruiseAlt:3500,
        lat:stand.lat,lon:stand.lon,
        alt:elev,gs:0,
        runway:cfg.depRwy,
        spawnWaypoint:'',preEntryNm:0,
        fpRoute:route,simRoute:route,
        start:Math.round(startMin*10)/10,
        isDeparture:true,
        ruleId:null,
        groundMeta:{...meta,kind:isCircuit?'vfr-circuit':'vfr-local',stand:stand.label,routeSource:'placeholder'},
      });
    }

    // Surface stand-fitness skips.
    if(nofit>0){
      warnings.push(`⚠ Skipped ${nofit} aircraft because no compatible stand was free at ${apt.icao}${twoHop?' (with 2-gate spacing enforced)':''} (types: ${[...nofitTypes].join(', ')}).`);
    }
    if(usedPoolDeps>0||usedPoolArrs>0){
      warnings.unshift(`✓ Pool used: ${usedPoolDeps}/${numDep} departures · ${usedPoolArrs}/${numArr} arrivals.`);
    }
    if(twoHop&&standCtx.supportsFitness){
      warnings.unshift(`✓ 2-gate spacing enforced: aircraft assigned with at least one empty stand between them.`);
    }
    if(standCtx.source==='rampagent'){
      warnings.unshift(`✓ RampAgent active: stand assignment is wingspan- and code-letter-aware.`);
    }

    return{aircraft,warnings,errors,standSource:standCtx.source,standCount:standCtx.stands.length};
  }

  // ───────────────────────────────────────────────────────────────────────
  // UI
  // ───────────────────────────────────────────────────────────────────────
  function GroundPanel({scenario,onChange,gates,pool,rampAgent,rampConfig}){
    const cfg=scenario.groundConfig||defaultGroundConfig();
    const setCfg=(patch)=>onChange({...scenario,groundConfig:{...cfg,...patch}});

    useEffect(()=>{
      const apt=AIRPORTS[cfg.airport];
      if(!apt)return;
      if(!apt.runways.includes(cfg.depRwy)||!apt.runways.includes(cfg.arrRwy)){
        setCfg({depRwy:apt.defaultDepRwy,arrRwy:apt.defaultArrRwy});
      }
    },[cfg.airport]);

    const apt=AIRPORTS[cfg.airport]||AIRPORTS.LFLL;
    const standCtx=resolveStandSource(apt,gates,rampAgent);

    const poolDeps=(pool||[]).filter(p=>p.origin===apt.icao&&p.route).length;
    const poolArrs=(pool||[]).filter(p=>p.dest===apt.icao&&p.route).length;

    const total=Math.max(0,+cfg.total||0);
    const vfrCount=Math.max(0,+cfg.vfrCount||0);
    const ifrTotal=Math.max(0,total-vfrCount);
    const numDep=Math.round(ifrTotal*(cfg.depRatio||0.8));
    const numArr=ifrTotal-numDep;
    const initialDepCount=Math.min(+cfg.initialPopulated||0,numDep);

    const groundCount=scenario.aircraft.filter(a=>a.groundMeta).length;

    function generate(){
      const{aircraft,warnings,errors}=buildGroundAircraft(cfg,gates,pool,rampAgent);
      if(errors.length){alert('Errors:\n'+errors.join('\n'));return;}
      const others=scenario.aircraft.filter(a=>!a.groundMeta);
      const merged=[...others,...aircraft].sort((a,b)=>(+a.start||0)-(+b.start||0));
      onChange({...scenario,aircraft:merged});
      if(warnings.length)alert(`Generated ${aircraft.length} aircraft.\n\n`+warnings.join('\n'));
    }
    function clearGround(){
      if(!groundCount)return;
      if(!confirm(`Remove ${groundCount} ground-generated aircraft?`))return;
      onChange({...scenario,aircraft:scenario.aircraft.filter(a=>!a.groundMeta)});
    }

    const lb="block text-xs text-slate-400 mb-1";
    const ip="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 font-mono focus:border-sky-500 focus:outline-none";

    // Stand source badge
    let sourceBadge;
    if(standCtx.source==='rampagent'){
      const ra=rampAgent[apt.icao];
      const standsWithCode=ra.stands.filter(s=>s.code).length;
      const standsWithWs=ra.stands.filter(s=>s.wingspan!==null).length;
      sourceBadge=(
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-900/40 border border-emerald-700/50 text-emerald-300 rounded text-xs font-medium">
          <Icon name="check" size={12}/>RampAgent · {ra.stands.length} stands ({standsWithCode} coded, {standsWithWs} wingspan-limited)
        </span>
      );
    }else if(standCtx.source==='ese'){
      sourceBadge=(
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-900/40 border border-sky-700/50 text-sky-300 rounded text-xs font-medium">
          <Icon name="check" size={12}/>ESE · {standCtx.stands.length} stands (no wingspan/code data)
        </span>
      );
    }else{
      sourceBadge=(
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-900/40 border border-amber-700/50 text-amber-300 rounded text-xs font-medium">
          <Icon name="alert" size={12}/>{standCtx.stands.length} hardcoded fallback stands
        </span>
      );
    }

    return(
      <div className="p-6 space-y-5 max-w-4xl">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-slate-200">S1 Ground · Single-airport scenario</h2>
          <div className="flex gap-2">
            {groundCount>0&&<button onClick={clearGround} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-200">Clear ground ({groundCount})</button>}
            <button onClick={generate} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-sm text-white font-medium"><Icon name="zap" size={14}/>Generate</button>
          </div>
        </div>

        {/* Mode toggle (S1/S2) */}
        <section>
          <label className={lb}>Generation mode</label>
          <div className="flex gap-2">
            <button onClick={()=>setCfg({mode:'S1'})} className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-medium ${cfg.mode!=='S2'?'bg-sky-700 text-white':'bg-slate-800 text-slate-400 hover:text-slate-200'}`}><Icon name="home" size={14}/>S1 — Ground only</button>
            <button onClick={()=>setCfg({mode:'S2'})} className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-medium ${cfg.mode==='S2'?'bg-amber-700 text-white':'bg-slate-800 text-slate-400 hover:text-slate-200'}`}><Icon name="radio" size={14}/>S2 — Tower flow</button>
          </div>
          {cfg.mode==='S2'&&<p className="text-xs text-amber-400 mt-2 flex items-center gap-1.5"><Icon name="alert" size={12}/>S2 Tower mode is not yet implemented — generation will fall back to S1 ground only.</p>}
        </section>

        {/* Airport + runways */}
        <section className="grid grid-cols-3 gap-3">
          <div>
            <label className={lb}>Airport</label>
            <select value={cfg.airport} onChange={e=>setCfg({airport:e.target.value})} className={ip}>
              {Object.values(AIRPORTS).map(a=><option key={a.icao} value={a.icao}>{a.icao} — {a.name}</option>)}
            </select>
            <p className="text-xs text-slate-500 mt-1 font-mono">Elev {apt.elevation} ft</p>
          </div>
          <div>
            <label className={lb}>Departure runway</label>
            <select value={cfg.depRwy} onChange={e=>setCfg({depRwy:e.target.value})} className={ip}>
              {apt.runways.map(rw=><option key={rw} value={rw}>{rw}</option>)}
            </select>
            <p className="text-xs text-slate-500 mt-1 font-mono">Default {apt.defaultDepRwy}</p>
          </div>
          <div>
            <label className={lb}>Arrival runway</label>
            <select value={cfg.arrRwy} onChange={e=>setCfg({arrRwy:e.target.value})} className={ip}>
              {apt.runways.map(rw=><option key={rw} value={rw}>{rw}</option>)}
            </select>
            <p className="text-xs text-slate-500 mt-1 font-mono">Default {apt.defaultArrRwy}</p>
          </div>
        </section>

        {/* Stand source badge + config status + spacing toggle */}
        <section className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            {sourceBadge}
            {!rampConfig&&<span className="text-xs text-amber-400/80">⚠ No RampAgent <code>config.json</code> loaded — wingspan check uses WTC fallback values</span>}
            {rampConfig&&standCtx.source!=='rampagent'&&<span className="text-xs text-slate-500">RampAgent config loaded but no airport file for {apt.icao} — upload <code className="text-slate-400">{apt.icao}.json</code> in Navdata for fitness-aware assignment</span>}
          </div>
          <label className={`flex items-center gap-2 text-sm cursor-pointer select-none ${standCtx.supportsFitness?'text-slate-300':'text-slate-600 cursor-not-allowed'}`} title={standCtx.supportsFitness?'When enabled, aircraft are assigned at least one empty stand apart, using RampAgent Block topology. A spawned stand X excludes X.Block and (X.Block).Block from the next assignments.':'Requires RampAgent data — Block topology not available with ESE or fallback stands.'}>
            <input type="checkbox" checked={!!cfg.twoGateSpacing} onChange={e=>setCfg({twoGateSpacing:e.target.checked})} disabled={!standCtx.supportsFitness} className="accent-sky-500"/>
            Always 2 gates apart (uses RampAgent Block adjacency)
            {!standCtx.supportsFitness&&<span className="text-xs text-slate-600">— RampAgent required</span>}
          </label>
        </section>

        {/* Counts */}
        <section>
          <h3 className="text-xs uppercase text-slate-500 font-semibold mb-2">Traffic Counts</h3>
          <div className="grid grid-cols-4 gap-3">
            <div><label className={lb}>Total aircraft</label><input type="number" min="0" max="100" className={ip} value={cfg.total} onChange={e=>setCfg({total:+e.target.value})}/></div>
            <div><label className={lb}>Already on field at T0</label><input type="number" min="0" className={ip} value={cfg.initialPopulated} onChange={e=>setCfg({initialPopulated:+e.target.value})}/><p className="text-xs text-slate-500 mt-1">Departures only</p></div>
            <div><label className={lb}>Session length (min)</label><input type="number" min="1" max="240" className={ip} value={cfg.sessionLen} onChange={e=>setCfg({sessionLen:+e.target.value})}/></div>
            <div><label className={lb}>VFR count</label><input type="number" min="0" max="20" className={ip} value={cfg.vfrCount} onChange={e=>setCfg({vfrCount:+e.target.value})}/><p className="text-xs text-slate-500 mt-1">½ circuit, ½ local hop</p></div>
          </div>
        </section>

        {/* Sliders */}
        <section className="grid grid-cols-2 gap-6">
          <div>
            <label className={lb}>Departure / Arrival ratio: <span className="text-sky-300 font-mono">{Math.round(cfg.depRatio*100)}/{100-Math.round(cfg.depRatio*100)}</span></label>
            <input type="range" min="0" max="1" step="0.05" value={cfg.depRatio} onChange={e=>setCfg({depRatio:+e.target.value})} className="w-full"/>
            <p className="text-xs text-slate-500 font-mono mt-1">{numDep} dep · {numArr} arr (of {ifrTotal} IFR)</p>
          </div>
          <div>
            <label className={lb}>Min arrival spacing: <span className="text-sky-300 font-mono">{cfg.minArrSpacing.toFixed(1)} min</span></label>
            <input type="range" min="0" max="10" step="0.5" value={cfg.minArrSpacing} onChange={e=>setCfg({minArrSpacing:+e.target.value})} className="w-full"/>
            <p className={`text-xs font-mono mt-1 ${numArr>0&&numArr*cfg.minArrSpacing>cfg.sessionLen?'text-amber-400':'text-slate-500'}`}>{numArr>0?`${numArr} arr × ${cfg.minArrSpacing.toFixed(1)} min = ${(numArr*cfg.minArrSpacing).toFixed(1)} min ${numArr*cfg.minArrSpacing>cfg.sessionLen?'⚠ exceeds session':''}`:'no arrivals'}</p>
          </div>
        </section>

        {/* Pool readiness card */}
        <section className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-2">
          <h3 className="text-xs uppercase text-slate-400 font-semibold flex items-center gap-1.5"><Icon name="layers" size={12}/>Pool readiness</h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-950/60 rounded p-2">
              <div className="text-slate-500 mb-0.5">Departures from {apt.icao}</div>
              <div className="font-mono"><span className={`text-base font-semibold ${poolDeps>=numDep&&numDep>0?'text-emerald-400':poolDeps>0?'text-sky-400':'text-amber-400'}`}>{poolDeps}</span><span className="text-slate-500"> in pool · </span><span className="text-slate-300">{numDep} requested</span></div>
            </div>
            <div className="bg-slate-950/60 rounded p-2">
              <div className="text-slate-500 mb-0.5">Arrivals to {apt.icao}</div>
              <div className="font-mono"><span className={`text-base font-semibold ${poolArrs>=numArr&&numArr>0?'text-emerald-400':poolArrs>0?'text-sky-400':'text-amber-400'}`}>{poolArrs}</span><span className="text-slate-500"> in pool · </span><span className="text-slate-300">{numArr} requested</span></div>
            </div>
          </div>
          <p className="text-xs text-slate-500">Pool routes are pulled when origin/dest matches; the rest fall back to placeholder routes (<code className="text-slate-400">DCT &lt;dest&gt;</code> for dep, <code className="text-slate-400">&lt;origin&gt; DCT</code> for arr). Import flights from the Plans tab to upgrade those.</p>
        </section>

        {/* Plan summary */}
        <section className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-400 space-y-0.5">
          <div className="text-slate-300 font-semibold mb-1">Will generate:</div>
          <div>· {initialDepCount} initial departures at gates (T+0, staggered 0.3 min)</div>
          <div>· {numDep-initialDepCount} session departures at gates (uniform across {cfg.sessionLen} min)</div>
          <div>· {numArr} session arrivals at RWY {cfg.arrRwy} exit (≥{cfg.minArrSpacing.toFixed(1)} min spacing, GS 30 kt)</div>
          <div>· {vfrCount} VFR ({Math.ceil(vfrCount/2)} circuit · {Math.floor(vfrCount/2)} local to {apt.vfrNearby.slice(0,2).join('/')})</div>
          {standCtx.source==='rampagent'&&<div className="text-emerald-400/80 mt-1">→ RampAgent fitness check active (wingspan + code letter)</div>}
          {cfg.twoGateSpacing&&standCtx.supportsFitness&&<div className="text-emerald-400/80">→ 2-gate spacing enforced (Block adjacency)</div>}
        </section>

      </div>
    );
  }

  SB.registerGenerator({
    id:'S1',
    label:'S1 Ground',
    render:(props)=><GroundPanel {...props}/>
  });
})();
