(function(G){
  "use strict";
  var M=G.CloseModel,C=M.config;

  // Presentation only. Model info owns eligibility and transfer amounts;
  // callers keep navigation, work, state changes and feedback timing.
  function form(n,one,few,many){
    var last=Math.abs(n)%10,teen=Math.abs(n)%100;
    return teen>=11&&teen<=14?many:last===1?one:last>=2&&last<=4?few:many;
  }
  function material(n,kind,accusative){
    return n+" "+(kind==="logs"?form(n,"бревно","бревна","брёвен"):form(n,accusative?"доску":"доска","доски","досок"));
  }
  function genitive(n,kind){
    return n+" "+(kind==="logs"?form(n,"бревна","брёвен","брёвен"):form(n,"доски","досок","досок"));
  }
  function cargo(s){return s.carry.amount?"В руках: "+material(s.carry.amount,s.carry.kind):"Руки свободны";}
  function stock(s,kind){return (kind==="logs"?"Брёвна ":"Доски ")+s[kind]+" из "+M.capacity(s)[kind];}
  function carried(s){return s.carry.kind==="logs"?"бревном":"досками";}
  function busy(s){return "Руки заняты "+carried(s)+". Сначала используй груз или сложи его в навес.";}
  function transferLabel(verb,amount,kind){
    return verb+" "+(amount===1?(kind==="logs"?"бревно":"доску"):material(amount,kind,true));
  }
  function upgradeCapacity(s){
    var caps=M.capacity(s),next=C.shed.capacity[Math.min(s.shedLevel+1,C.shed.capacity.length-1)];
    return s.shedLevel<C.shed.capacity.length-1?"Вместимость: брёвна "+caps.logs+" → "+next.logs+", доски "+caps.boards+" → "+next.boards:"Вместимость: брёвна "+caps.logs+", доски "+caps.boards;
  }
  function expansion(caps){return "Навес расширен. Теперь в нём помещается "+material(caps.logs,"logs")+" и "+material(caps.boards,"boards")+".";}
  function reason(s,a,kind){
    if(a.available)return "";
    if(a.done)return a.type==="collect"?"Бревно уже подобрано.":a.reason;
    if(a.type==="upgrade")return "В навесе не хватает "+genitive(Math.max(0,C.shed.upgradeBoards-s.boards),"boards")+". Стоимость оплачивается только досками из навеса.";
    if(a.type==="store"){
      if(!s.carry.amount)return "Руки свободны. Принеси бревно или доски.";
      if(s.carry.kind!==kind)return "В руках "+(s.carry.kind==="logs"?"бревно. Выбери отсек брёвен.":"доски. Выбери отсек досок.");
      return "Отсек "+(kind==="logs"?"брёвен":"досок")+" полон: "+s[kind]+" из "+M.capacity(s)[kind]+". "+(kind==="logs"?"Бревно останется":"Доски останутся")+" в руках.";
    }
    if(a.type==="take"){
      if(s.carry.amount&&s.carry.kind!==kind)return busy(s);
      if(a.reason==="В руках уже полный груз.")return "В руках уже полный груз: "+material(s.carry.amount,kind)+".";
      return a.reason;
    }
    if(a.type==="saw")return s.carry.amount?busy(s):a.reason;
    if(a.type==="repair"){
      if(s.carry.amount&&s.carry.kind!=="boards")return busy(s)+" Бревно можно распилить на верстаке.";
      var required=a.id==="gallery-repair"?C.gallery.repairBoards:a.id==="stairs"?C.stairsBoards:C.repairBoards,held=s.carry.kind==="boards"?s.carry.amount:0;
      return "В руках не хватает "+genitive(Math.max(0,required-held),"boards")+". "+(s.boards>0?"Доски можно взять из навеса.":"Доски получаются из бревна на верстаке.");
    }
    if(a.type==="collect"&&a.reason.indexOf("Руки заняты")===0)return busy(s)+" Бревно останется на месте.";
    return a.reason;
  }
  function action(s,id){
    var a=M.info(s,id);if(!a)return null;
    var kind=String(id).split(":")[1],label=a.label,object="",detail="",preview="";
    if(a.type==="chop"){object="Дерево";detail="После рубки бревно останется у пня. Его нужно поднять отдельно.";preview="Бревно останется у пня.";}
    else if(a.type==="collect"){label="Поднять бревно";object=String(id).indexOf("drift:")===0?"Бревно на берегу":"Бревно у пня";detail="Бревно можно отнести к верстаку или сложить в навес.";preview="В руках будет "+material(C.logsPerTree,"logs")+".";}
    else if(a.type==="saw"){label="Распилить бревно";object="Верстак";detail="Распилится бревно из рук. Доски останутся в руках.";preview="Получится "+material(C.boardsPerLog,"boards")+" в руках.";}
    else if(id==="repair"){label="Починить ступень";object="Ступень у дома";detail="Потребуется "+material(C.repairBoards,"boards")+" из рук.";preview="Ступень будет целой. Можно будет зажечь маяк.";}
    else if(id==="stairs"){object="Спуск к берегу";detail="Потребуется "+material(C.stairsBoards,"boards")+" из рук. Это необязательное дело.";preview="Откроется короткий путь к берегу.";}
    else if(id==="gallery-repair"){object="Галерея маяка";detail="Стоимость: "+material(C.gallery.repairBoards,"boards")+" из рук. Восстановятся настил и перила.";preview="Откроется дневной обзор с галереи маяка.";}
    else if(id==="gallery-view"){object="Галерея маяка";detail="Дневной обзор острова и берега. Можно осмотреться и воспользоваться биноклем.";preview="Смотритель поднимется на готовую площадку.";}
    else if(a.type==="light"){label=a.done?"Огонь зажжён":"Зажечь маяк";object="Маяк";detail="Огонь можно зажечь после ремонта ступени у дома.";preview="В фонаре маяка загорится огонь.";}
    else if(a.type==="rest"){object="Скамья у моря";detail="Во время отдыха день не проходит.";preview="Смотритель присядет у моря.";}
    else if(a.type==="shed"){label="Открыть навес";object="Навес";detail=stock(s,"logs")+" · "+stock(s,"boards");preview="Можно сложить или взять материалы.";}
    else if(a.type==="upgrade"){label="Расширить навес";object="Навес";detail="Стоимость: "+material(C.shed.upgradeBoards,"boards")+" из навеса";preview=expansion(C.shed.capacity[Math.min(s.shedLevel+1,C.shed.capacity.length-1)]);}
    else if(a.type==="store"||a.type==="take"){
      object=kind==="logs"?"Отсек брёвен":"Отсек досок";
      label=a.available&&a.amount>0?transferLabel(a.type==="store"?"Сложить":"Взять",a.amount,kind):(a.type==="store"?"Сложить ":"Взять ")+(kind==="logs"?"бревно":"доски");
      detail=a.type==="store"?"Материал перейдёт из рук в навес.":"Материал перейдёт из навеса в руки.";
      if(a.available&&a.amount>0)preview=a.type==="store"?"В навес: "+material(a.amount,kind)+"."+(a.amount<s.carry.amount?" Остаток останется в руках.":""):"В руки: "+material(a.amount,kind)+".";
    }
    var out={id:a.id,label:label,object:object,reason:reason(s,a,kind),detail:detail,resultPreview:preview,available:a.available,done:a.done,type:a.type,amount:a.amount};
    if(a.type==="upgrade"){out.cost=detail;out.capacityPreview=upgradeCapacity(s);}
    if(id==="gallery-repair")out.cost="Стоимость: "+material(C.gallery.repairBoards,"boards")+" из рук";
    return out;
  }
  // s is the completed state; amount is the finish result, not remaining stock
  // or final cargo. In particular, topping up one held board transfers one.
  function result(s,id,type,amount){
    var a=M.info(s,id);if(!a)return "";type=type||a.type;
    if(type==="store")return "В навес сложено: "+material(amount,String(id).split(":")[1])+". "+cargo(s)+".";
    if(type==="take")return "Взято из навеса: "+material(amount,String(id).split(":")[1])+". "+cargo(s)+".";
    if(type==="upgrade")return expansion(M.capacity(s));
    if(id==="repair")return "Ступень починена. Теперь можно зажечь маяк.";
    if(id==="stairs")return "Спуск восстановлен. Короткий путь к берегу открыт.";
    if(id==="gallery-repair")return "Галерея восстановлена: настил и перила готовы. Открыт дневной обзор острова и берега.";
    if(type==="chop")return "Дерево срублено. Бревно осталось у пня.";
    if(type==="collect")return cargo(s)+". Можно отнести бревно к верстаку или в навес.";
    if(type==="saw")return cargo(s)+". Можно отнести доски к ремонту или в навес.";
    if(type==="light")return "Вечерний огонь зажжён.";
    if(type==="rest")return "Отдых у моря. День не проходит.";
    return "";
  }
  function shed(s){
    return {logs:stock(s,"logs"),boards:stock(s,"boards"),cargo:cargo(s),help:"За один раз можно нести "+material(C.carryLimit.logs,"logs",true)+" или до "+genitive(C.carryLimit.boards,"boards")+".",upgrade:action(s,"shed:upgrade")};
  }
  function guidance(s,context){
    context=context||{};
    if(context.sitting)return {title:"Отдых у моря",detail:"День не проходит. Можно встать и продолжить прогулку."};
    var job=context.job,a=job&&job.id?action(s,job.id):null;
    if(job&&job.working)return {title:a?a.label:"Смотритель работает",detail:(a?a.resultPreview+" ":"")+"Пауза — остановить; сделанная часть сохранится."};
    if(job)return {title:"Смотритель идёт",detail:job.action&&a?"Затем начнёт: "+a.label.toLowerCase()+". Стоп — остановиться.":"У предмета он остановится. Затем выбери действие."};
    if(!s.repaired){
      if(s.carry.kind==="logs")return {title:"Подойди к верстаку",detail:"Бревно в руках. "+action(s,"saw").resultPreview};
      if(s.carry.kind==="boards"){
        a=action(s,"repair");
        return a.available?{title:"Подойди к ступени у дома",detail:"Доски в руках. Почини ступень — после этого можно зажечь маяк."}:{title:"Собери доски для ступени",detail:a.reason};
      }
      a=action(s,"take:boards");
      if(a.available&&a.amount>=C.repairBoards)return {title:"Возьми доски из навеса",detail:"Для ступени нужно принести "+material(C.repairBoards,"boards",true)+" в руках."};
      if(action(s,"take:logs").available)return {title:"Возьми бревно из навеса",detail:"Затем его можно распилить на верстаке: получится "+material(C.boardsPerLog,"boards")+" в руках."};
      if(s.trees.some(function(t){return action(s,"collect:"+t.id).available;}))return {title:"Подними бревно у пня",detail:"После рубки оно осталось на земле. Затем его можно отнести к верстаку."};
      var standing=s.trees.filter(function(t){return action(s,"chop:"+t.id).available;});
      if(standing.length){
        var near=standing.some(function(t){var q=M.info(s,"chop:"+t.id);return Math.hypot(s.avatar.x-q.x,s.avatar.z-q.z)<=C.interactionReach&&M.clear(s,s.avatar,q);});
        var shore=s.shore.some(function(d){return action(s,"drift:"+d.id).available;});
        return near?{title:"Сруби дерево",detail:"Выбери действие, затем подними бревно у пня."}:{title:"Подойди к дереву",detail:"Нажми на дерево — смотритель подойдёт. У дерева выбери «Срубить дерево»."+(shore?" Можно также взять бревно на берегу.":"")};
      }
      if(s.shore.some(function(d){return action(s,"drift:"+d.id).available;}))return {title:"Подними бревно на берегу",detail:"Плавник можно отнести к верстаку или сложить в навес."};
      return {title:"Проверь запасы и груз",detail:"Вся древесина уже подобрана. Для ступени нужны доски в руках; запас в навесе можно взять отдельно."};
    }
    if(!s.lit)return {title:"Подойди к маяку",detail:"Ступень готова. У маяка можно зажечь вечерний огонь."};
    var options=[];
    if(!s.stairs)options.push("восстановить спуск");
    if(s.shedLevel<C.shed.capacity.length-1)options.push("расширить навес");
    return {title:"Вечер на острове",detail:"Можно прогуляться"+(options.length?", "+options.join(", "):"")+" или присесть у моря."};
  }
  G.CloseUI={action:action,result:result,cargo:cargo,material:material,guidance:guidance,shed:shed};
})(globalThis);
