// UI-003 session presentation only. One controller per page; no game/save state.
// App binds Escape/root-back to back(), and owns rendering, focus and input cleanup.
(function(G){
  "use strict";
  var KEY="__lighthouse_ui_modes_v1__",tag="close-ui-modes";
  var modes=["walk","shed","bag","binoculars","gallery","menu","help","confirm"];
  var details={places:"binoculars","shed-details":"shed","bag-places":"bag"};
  var own=Object.prototype.hasOwnProperty;
  function page(mode,detail){return {mode:mode,detail:detail||null};}
  function copyPath(path){return path.map(function(p){return page(p.mode,p.detail);});}
  function marker(state){
    var value=state&&typeof state==="object"&&state[KEY];
    return value&&value.tag===tag&&value.version===1&&own.call(value,"base")?value:null;
  }
  function entry(base){
    // Preserve foreign fields at their existing keys as well as the complete value
    // (which may be null, an array, a primitive, or contain our reserved key).
    var state={};
    if(base&&typeof base==="object"&&!Array.isArray(base))Object.keys(base).forEach(function(k){
      Object.defineProperty(state,k,{value:base[k],enumerable:true,writable:true,configurable:true});
    });
    state[KEY]={tag:tag,version:1,base:base};return state;
  }
  function CloseUIModes(options){
    options=options||{};
    this._path=[page("walk")];this._pending=false;this._destroyed=false;this._changing=false;
    this._lastClosed=-Infinity;this._lateClose=false;this._timer=null;
    this._onChange=typeof options.onChange==="function"?options.onChange:function(){};
    this._onPending=typeof options.onPending==="function"?options.onPending:function(){};
    this._now=options.now||function(){return Date.now();};
    // Native Window timers require their global receiver. Keep injected test
    // clocks unchanged, but never invoke a borrowed browser method on this UI.
    this._setTimeout=options.setTimeout||function(fn,ms){return G.setTimeout(fn,ms);};
    this._clearTimeout=options.clearTimeout||function(id){G.clearTimeout(id);};
    this._backTimeout=Number.isFinite(options.backTimeout)?Math.max(0,options.backTimeout):600;
    this._window=own.call(options,"window")?options.window:(G.window||null);
    this._history=null;
    try{this._history=own.call(options,"history")?options.history:this._window&&this._window.history;}catch(ignore){}
    this._historyAvailable=!!(this._history&&typeof this._history.pushState==="function"&&typeof this._history.back==="function"&&this._window&&typeof this._window.addEventListener==="function");
    this._canBack=this._historyAvailable;
    var self=this;this._onPop=function(event){self._pop(event);};
    if(this._historyAvailable){
      try{this._window.addEventListener("popstate",this._onPop);}catch(ignore){this._historyAvailable=false;this._canBack=false;}
    }
  }
  CloseUIModes.prototype.snapshot=function(){
    var current=this._path[this._path.length-1];
    return {mode:current.mode,detail:current.detail,pending:this._pending};
  };
  CloseUIModes.prototype.is=function(mode){return this._path[this._path.length-1].mode===mode;};
  CloseUIModes.prototype.blocksWorld=function(){
    var state=this.snapshot();return state.pending||state.detail!==null||(state.mode!=="walk"&&state.mode!=="binoculars");
  };
  CloseUIModes.prototype.recentlyClosed=function(ms){
    ms=Number.isFinite(ms)?Math.max(0,ms):350;
    var age=this._now()-this._lastClosed;return age>=0&&age<ms;
  };
  CloseUIModes.prototype._state=function(){
    try{return {ok:true,value:this._history.state};}catch(ignore){return {ok:false};}
  };
  CloseUIModes.prototype._ownsEntry=function(){
    if(!this._historyAvailable)return false;
    var state=this._state();return state.ok&&!!marker(state.value);
  };
  CloseUIModes.prototype._ensureEntry=function(){
    if(!this._historyAvailable)return false;
    var state=this._state();
    if(!state.ok){this._historyAvailable=false;this._canBack=false;return false;}
    if(marker(state.value))return true; // Reuse an inactive/previous-session sentinel.
    try{
      // Deliberately omit the URL argument: never modify path, query, or hash.
      // The base entry is untouched. Details and sibling modes need no new entry.
      this._history.pushState(entry(state.value),"");
      if(this._ownsEntry())return true;
    }catch(ignore){}
    this._historyAvailable=false;this._canBack=false;return false;
  };
  CloseUIModes.prototype._apply=function(path,meta,previous){
    previous=previous||this.snapshot();var next=path[path.length-1];
    if(previous.mode===next.mode&&previous.detail===next.detail)return false;
    if(previous.mode!=="walk"&&(previous.mode!==next.mode||(previous.detail!==null&&previous.detail!==next.detail)))this._lastClosed=this._now();
    this._path=copyPath(path);this._changing=true;
    try{this._onChange(this.snapshot(),previous,meta);}finally{this._changing=false;}
    return true;
  };
  CloseUIModes.prototype._settle=function(late){
    if(this._timer!==null){this._clearTimeout(this._timer);this._timer=null;}
    this._lateClose=!!late;
    if(!this._pending)return;
    this._pending=false;this._onPending(false,this.snapshot());
  };
  CloseUIModes.prototype._leave=function(path,meta){
    var final=path[path.length-1].mode==="walk";
    var navigate=final&&this._canBack&&this._ownsEntry();
    if(!navigate)return this._apply(path,meta);
    // Hide overlays and clear app input synchronously. A second tap/reopen cannot
    // race the asynchronous back(), including from the onChange callback itself.
    var previous=this.snapshot();this._pending=true;
    var changed=this._apply(path,meta,previous),self=this;
    this._onPending(true,this.snapshot());
    this._timer=this._setTimeout(function(){
      self._timer=null;self._canBack=false;self._settle(true);
    },this._backTimeout);
    try{this._history.back();}catch(ignore){this._canBack=false;this._settle(true);}
    return changed;
  };
  CloseUIModes.prototype.open=function(mode,options){
    if(this._destroyed||this._pending||this._changing||modes.indexOf(mode)<0)return false;
    options=options||{};
    if(mode==="walk")return this.reset(options.source);
    var current=this.snapshot(),path=[page("walk")];
    if(current.mode===mode&&current.detail===null)return false;
    if(mode==="help"||mode==="confirm"){
      if(modes.indexOf(options.returnTo)>=0&&options.returnTo!==mode){
        if(options.returnTo!=="walk"){
          if(["bag","binoculars","menu"].indexOf(options.returnTo)>=0&&this._path.some(function(p){return p.mode==="gallery";}))path.push(page("gallery"));
          path.push(page(options.returnTo));
        }
      }else if(current.mode!=="walk"&&current.mode!==mode){
        path=copyPath(this._path);
        // Help/confirmation replace one another rather than accumulating dialogs.
        if(current.mode==="help"||current.mode==="confirm")path.pop();
      }
    }
    if(["bag","binoculars","menu"].indexOf(mode)>=0&&this._path.some(function(p){return p.mode==="gallery";}))path.push(page("gallery"));
    path.push(page(mode));this._ensureEntry();
    return this._apply(path,{reason:"open",source:options.source||null});
  };
  CloseUIModes.prototype.openDetail=function(detail){
    if(this._destroyed||this._pending||this._changing)return false;
    var current=this.snapshot();
    if(detail===null)return current.detail!==null?this.back():false;
    if(!own.call(details,detail)||details[detail]!==current.mode||current.detail===detail)return false;
    var path=copyPath(this._path);if(current.detail!==null)path.pop();
    path.push(page(current.mode,detail));
    return this._apply(path,{reason:"detail",source:null});
  };
  CloseUIModes.prototype.back=function(source){
    if(this._destroyed||this._pending||this._changing||this._path.length===1)return false;
    return this._leave(this._path.slice(0,-1),{reason:"back",source:source||null});
  };
  CloseUIModes.prototype.reset=function(source){
    if(this._destroyed||this._pending||this._changing||this.is("walk"))return false;
    return this._leave([page("walk")],{reason:"reset",source:source||null});
  };
  CloseUIModes.prototype.closeAll=CloseUIModes.prototype.reset;
  CloseUIModes.prototype._pop=function(event){
    if(this._destroyed)return;
    // Native PopStateEvent.state is a prototype getter, not an own property.
    var state=event&&"state" in event?event.state:this._state().value;
    if(marker(state))return; // Forward to an inert sentinel never reopens old UI.
    if(this._pending){this._settle(false);return;}
    if(this._lateClose){
      // No acknowledgement means blocked history or a delayed browser traversal.
      // Keep the current route intact if that traversal eventually arrives after
      // fallback/reopen; one such pop is consumed, then normal Back works again.
      this._lateClose=false;this._canBack=this._historyAvailable;
      if(!this.is("walk"))this._ensureEntry();return;
    }
    if(this.is("walk"))return;
    var path=this._path.slice(0,-1);
    if(path[path.length-1].mode!=="walk")this._ensureEntry();
    this._apply(path,{reason:"popstate",source:"browser"});
  };
  CloseUIModes.prototype.destroy=function(){
    if(this._destroyed)return;
    this._destroyed=true;
    if(this._timer!==null)this._clearTimeout(this._timer);
    this._timer=null;this._pending=false;
    if(this._window&&typeof this._window.removeEventListener==="function")this._window.removeEventListener("popstate",this._onPop);
  };
  // History intentionally stores no UI route: reload/Forward stays in walk.
  // A sandbox may block history altogether. Explicit buttons/Escape still work.
  // After a silent back timeout, the first late/native pop is absorbed to protect
  // a reopened route; its origin cannot be distinguished by the browser API.
  G.CloseUIModes=CloseUIModes;
})(globalThis);
