window.onload = replaceWords;
let targetNode = document.querySelector('body');

async function replaceWords () {
    // observer.disconnect();
    const evergreenStatus = await chrome.storage.sync.get(["evergreenStatus"]);
    if (evergreenStatus.evergreenStatus == 0){
        return;
    }
    const words = localStorage.getItem('words');
    const wordList = JSON.parse(words);


    //testing
    // var startTime = performance.now()



    for (let i=0; i<wordList.length; i++){
        regex = new RegExp(`\\b${wordList[i].word}\\b`, 'gi');
        let value = findAndReplaceDOMText(targetNode,{
            preset: 'prose',
            find: regex,
            replace: ()=>{
                const span = document.createElement('span');
                span.setAttribute('data-tooltip',wordList[i].context);
                span.setAttribute('original',wordList[i].word);
                span.classList.add('haramContainer');

                const haram = document.createElement('span');
                haram.classList.add('haram');
                const haramText = document.createTextNode(wordList[i].word);
                haram.appendChild(haramText);
                span.appendChild(haram);

                const halal = document.createElement('span');
                halal.classList.add('halal');
                const halalText = document.createTextNode(wordList[i].alt);
                halal.appendChild(halalText);
                span.appendChild(halal);
                return span;
            },

        })
    }


    //testing
    // var endTime = performance.now()
    // console.log(`Call to replaceWords took ${endTime - startTime} milliseconds`)
    // observer.observe(targetNode, config);
    // ready = 0;
}


//Mutation Obsever, Checks for new nodes added

// const config = { childList: true, subtree: true };
// const callback = (mutationList, observer) => {
//     for (const mutation of mutationList) {
//       if (mutation.type === 'childList') {
//         // console.log('A child node has been added or removed.');
//         if (ready == 1){
//             replaceWords();
//         }
//       }
//     }
// };
// const observer = new MutationObserver(callback);
// observer.observe(targetNode, config);
// let ready = 0;
// setInterval(() => {
//     if (ready == 0)
//     ready = 1;
// }, 1000);