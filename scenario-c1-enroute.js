// scenario-c1-enroute.js
// C1 Enroute generator — same rule-based UI as S3, but new rules default to
// mode:'C1' and the rule list is filtered by that mode.
//
// Both S3 and C1 read/write the same `scenario.rules` array; mode is just the
// per-sub-tab filter and the default for newly-created rules.
//
// This file is intentionally thin: scenario-s3-approach.js exposes the
// RulePanel component on window.SB.RulePanel and we just mount it here with
// mode='C1'. If the S3 plugin file is missing or fails to load, we render a
// helpful placeholder instead of crashing.
(function(){
  const SB=window.SB;
  const { React,Icon }=SB;

  function C1Panel(props){
    const RulePanel=SB.RulePanel;
    if(!RulePanel){
      return(
        <div className="p-12 text-center text-slate-500">
          <div className="text-amber-500 mb-3"><Icon name="alert" size={32} className="mx-auto"/></div>
          <p className="mb-1 text-slate-300 font-semibold">C1 panel unavailable</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">The C1 plugin reuses the rule UI defined in <code className="text-slate-400">scenario-s3-approach.js</code>. That file does not appear to be loaded — check that its <code className="text-slate-400">&lt;script&gt;</code> tag is present in <code className="text-slate-400">sweatbox-builder-v6.html</code>.</p>
        </div>
      );
    }
    return <RulePanel mode="C1" {...props}/>;
  }

  SB.registerGenerator({
    id:'C1',
    label:'C1 Enroute',
    render:(props)=><C1Panel {...props}/>
  });
})();
