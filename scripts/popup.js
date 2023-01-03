
const switchLabel = document.querySelector('.switch');
chrome.storage.sync.get(["evergreenStatus"]).then((result)=>{
    console.log(result.evergreenStatus)
    if (result.evergreenStatus == 0){
        switchLabel.innerHTML = '<input type="checkbox" id="check"><span class="slider round"></span>';
    
    } else {
        switchLabel.innerHTML = '<input type="checkbox" id="check" checked><span class="slider round"></span>';
    }
}).then(()=>{
    const checkbox = document.querySelector('#check');
    console.log(checkbox)
    checkbox.addEventListener('change', ()=>{
        if (checkbox.checked == true) {
            console.log('isee')
            chrome.storage.sync.set({evergreenStatus: 1})
        } else {
            chrome.storage.sync.set({evergreenStatus: 0})
        }
    });    
});

