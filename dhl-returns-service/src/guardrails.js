const cfg = require('./config');
// Liefert {ok:true} oder {ok:false, reason:'...'} — nur für MODE=AUTO relevant
function check(ctx){
  const ageDays = (Date.now() - new Date(ctx.orderCreatedAt).getTime())/86400000;
  if (ageDays > cfg.maxOrderAgeDays) return { ok:false, reason:`Bestellung ${Math.round(ageDays)}d alt > ${cfg.maxOrderAgeDays}d` };
  const reasons = (ctx.returnReasons||[]).map(r=>String(r).toUpperCase());
  if (reasons.some(r=>cfg.blockedReasons.includes(r))) return { ok:false, reason:`Grund gesperrt (${reasons.join(',')})` };
  if (!ctx.receiverId) return { ok:false, reason:`keine receiverId für Land ${ctx.country}` };
  return { ok:true };
}
module.exports = { check };
