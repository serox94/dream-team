(() => {
  let chart;
  window.renderDreamChart = catches => {
    const canvas=document.getElementById('fishChart');if(!canvas)return;
    if(!window.Chart){Dream.notice('Wykres jest niedostępny; statystyki liczbowe pozostają widoczne.',true);return;}
    const dates=[...new Set(catches.map(c=>Dream.dateInput(c.caught_at).slice(0,10)))].sort();
    const palette=['#53b2ff','#3ddc97','#b699ff','#f7c45f','#ff8a96'];
    const datasets=window.DREAM_TRIP.participants.flatMap((a,index)=>{
      const counts=dates.map(day=>catches.filter(c=>c.person===a.name&&Dream.dateInput(c.caught_at).startsWith(day)).length);
      const weights=dates.map(day=>catches.filter(c=>c.person===a.name&&Dream.dateInput(c.caught_at).startsWith(day)).reduce((sum,c)=>sum+Number(c.weight),0));
      const color=palette[index%palette.length];
      return [{label:a.name+' · liczba ryb',data:counts,backgroundColor:color,borderRadius:5,yAxisID:'y'},{type:'line',label:a.name+' · kg',data:weights,borderColor:color,backgroundColor:color,tension:0.2,yAxisID:'y1'}];
    });
    chart?.destroy();
    chart=new Chart(canvas,{type:'bar',data:{labels:dates.map(d=>d.slice(8)+'.'+d.slice(5,7)),datasets},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{labels:{color:'#dfe7f2'}}},scales:{x:{ticks:{color:'#aeb9c9'}},y:{beginAtZero:true,ticks:{precision:0,color:'#aeb9c9'},title:{display:true,text:'Liczba ryb',color:'#dfe7f2'}},y1:{beginAtZero:true,position:'right',grid:{drawOnChartArea:false},ticks:{color:'#aeb9c9'},title:{display:true,text:'kg',color:'#dfe7f2'}}}}});
  };
})();
