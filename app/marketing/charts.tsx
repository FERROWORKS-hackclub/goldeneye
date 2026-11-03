export const chartColors=['#244c3b','#c66640','#b9a157','#6f9485','#7b87aa','#b98492','#638a9d','#a6ac9c'];
type Item={label:string;count:number;percent:number};
export function ResearchChart({title,items=[],bar=false}:{title:string;items:Item[];bar?:boolean}){
 const total=items.reduce((n,x)=>n+x.count,0);let offset=0;
 return <section className="mk-chart"><h3>{title}</h3>{total?<div className={bar?'mk-chart-bars':'mk-chart-pie'}>{!bar&&<svg viewBox="0 0 100 100" role="img" aria-label={`${title}: ${items.map(x=>`${x.label} ${x.percent}%`).join(', ')}`}><circle cx="50" cy="50" r="34" fill="none" stroke="#edf0e9" strokeWidth="21"/>{items.map((x,i)=>{const length=x.count/total*213.628;const start=offset;offset+=length;return <circle key={x.label} cx="50" cy="50" r="34" fill="none" stroke={chartColors[i%chartColors.length]} strokeWidth="21" strokeDasharray={`${length} ${213.628-length}`} strokeDashoffset={-start} transform="rotate(-90 50 50)"/>})}<text x="50" y="48" textAnchor="middle" className="mk-chart-number">{total}</text><text x="50" y="60" textAnchor="middle" className="mk-chart-small">answers</text></svg>}<div className="mk-legend">{items.map((x,i)=><div key={x.label}><span className="mk-legend-label"><i style={{background:chartColors[i%chartColors.length]}}/>{x.label}</span><b>{x.percent}% <small>({x.count})</small></b>{bar&&<span className="mk-bar-track"><span style={{width:`${Math.min(100,x.percent)}%`,background:chartColors[i%chartColors.length]}}/></span>}</div>)}</div></div>:<p className="mk-muted">No answers yet</p>}</section>;
}
export function ResearchCharts({summary}:{summary:any}){const g=summary?.groups||{};return <div className="mk-charts">
 <ResearchChart title="Would you buy this machine?" items={g.wouldBuy}/><ResearchChart title="Fair price · AUD" items={g.price}/>
 <ResearchChart title="Priority tool" items={g.priority}/><ResearchChart title="Drive / material system" items={g.drive}/>
 <ResearchChart title="Speed, price or quality · choose two" items={g.tradeoffs} bar/><ResearchChart title="Shipping time · days" items={[...(g.shippingDays||[])].sort((a,b)=>Number(a.label)-Number(b.label))} bar/>
 <ResearchChart title="Filaments · multiple choices" items={g.filament} bar/><ResearchChart title="Wood types · multiple choices" items={g.wood} bar/>
 <ResearchChart title="Reported continent" items={g.continent}/><ResearchChart title="Estimated IP country" items={g.country}/>
 <ResearchChart title="Browser" items={g.browser}/><ResearchChart title="Device type" items={g.device}/>
 <ResearchChart title="Operating system" items={g.os}/><ResearchChart title="Estimated IP region" items={g.region} bar/>
 </div>;}
