(() => {
  const formatWeight = value => Number(value).toLocaleString((document.documentElement.lang==='en'?'en-GB':'pl-PL'),{minimumFractionDigits:1,maximumFractionDigits:1});

  window.renderDreamChart = catches => {
    const host=document.getElementById('trip-score-charts'),total=document.getElementById('trip-score-total');
    if(!host||!total)return;
    const people=window.DREAM_TRIP.participants;
    const values=people.map(person=>{
      const own=catches.filter(item=>item.person===person.name);
      return {name:person.name,count:own.length,weight:own.reduce((sum,item)=>sum+Number(item.weight||0),0)};
    });
    const fish=values.reduce((sum,item)=>sum+item.count,0);
    const weight=values.reduce((sum,item)=>sum+item.weight,0);
    total.textContent=`Razem: ${fish} ryb · ${formatWeight(weight)} kg`;
    host.replaceChildren();

    for(const [title,key] of [['Liczba ryb','count'],['Łączna waga','weight']]){
      const section=document.createElement('section');section.className='score-chart';
      const heading=document.createElement('h4');heading.textContent=title;section.append(heading);
      const max=Math.max(...values.map(item=>item[key]),0);
      for(const person of values){
        const row=document.createElement('div');row.className='score-row';
        const name=document.createElement('span');name.className='score-name';name.textContent=person.name;
        const track=document.createElement('div');track.className='score-track';
        const bar=document.createElement('span');bar.className='score-bar';bar.style.width=max?`${Math.max(4,person[key]/max*100)}%`:'0%';
        track.append(bar);
        const value=document.createElement('strong');value.className='score-value';value.textContent=key==='count'?String(person.count):`${formatWeight(person.weight)} kg`;
        row.setAttribute('aria-label',`${person.name}: ${value.textContent}${key==='count'?' ryb':''}`);
        row.append(name,track,value);section.append(row);
      }
      host.append(section);
    }
  };
})();
