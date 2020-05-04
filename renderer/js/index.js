const {ipcRenderer} = require('electron');
const fs = require('fs');
const path = require('path');
const $ = require('jquery');
const toastr = require('toastr');

var projectsCache = [];
var keysCache = [];

document.getElementById('addProject').addEventListener('click', function(){
  ipcRenderer.send('select-project', {});
});

document.getElementById('saveKey').addEventListener('click', function(){
  data = {name: $('#keyName').val(), description: $('#keyDescription').val(), keyFile: document.getElementById("keyFile").files[0].path}
  ipcRenderer.send('save-key', data);
});

ipcRenderer.on('key-saved', (event, status) => {
  if(status) {
    $('#addSshKeyModal').modal('hide');
    $('#keyName').val('');
    $('#keyDescription').val('');
    $('#keyFile').val('');
  }  
});

document.getElementById('generateConfig').addEventListener('click', function(){
  ipcRenderer.send('generate-config', {});
});

document.getElementById('reloadProjects').addEventListener('click', function(){
  ipcRenderer.send('reload-projects', {});
});


ipcRenderer.on('projects-fetched', (event, rows) => {
  if(rows && rows instanceof Array && rows.length > 0){
    projectsCache = rows;
    let projectList = $('#projectListing');
    $('#projectListing').empty();
    let srNo = 1;
    rows.forEach(row => {
      renderProjectRow(srNo,projectList,row);
      srNo++;
    }); 
  }else{
    $('#projectListing').empty().append(`
      <tr>
        <td colspan="4">No Projects Found</td>
      </tr>`);
  }
  addSSHKeysDropDown();
});

ipcRenderer.on('sshkeys-fetched', (event, rows) => {
  if(rows && rows instanceof Array && rows.length > 0){
    keysCache = rows;
    let keysList = $('#keysListing');
    $('#keysListing').empty();
    let srNo = 1;
    rows.forEach(row => {
      renderKeysRow(srNo,keysList,row);
      srNo++;
    });
  }else{
    $('#keysListing').empty().append(`
      <tr>
        <td colspan="4">No Keys Found</td>
      </tr>`);
  }
  addSSHKeysDropDown();     
});

ipcRenderer.on('folder-fetched', (event, data) => {
  if(data == false){
    alert("please select directory that contains .git folder");
  }
})

ipcRenderer.on('error-message', (event, message) => {
  toastr.error(message);
});

ipcRenderer.on('success-message', (event, message) => {
  toastr.success(message);
});

ipcRenderer.on('key-generated', (event, data) => {
  alert('Keys Saved at ' + data);
})

renderProjectRow = (srNo, elem, row) => {
  elem.append(`
    <tr>
      <td>${srNo}</td>
      <td>${row['name']}</td>
      <td>${row['path']}</td>
      <td>${row['username']}</td>
      <td>
      <div class="row">
        <span class="col-8 pr-1">
          <select id="projKey_${row['id']}" class="form-control" onchange="showSaveBtn(${row['id']})"></select>
        </span>
        <span class="col-4 pl-1">
          <button id="projKeySave_${row['id']}" class="btn btn-success btn-sm" style="display:none" onclick="updateSSHKey(${row['id']})">✓</button>
        </span>
      </div>
      </td>
      <td>
        <button class="btn btn-danger" onclick="deleteProject(${row['id']})"> <i class="fas fa-trash"></i> Delete </button>
      </td>
    </tr>  
    `);
}

renderKeysRow = (srNo, elem, row) => {
  elem.append(`
    <tr>
      <td>${srNo}</td>
      <td>${row['name']}</td>
      <td>${row['description']}</td>
      <td>${row['path']}</td>
      <td>
        <button class="btn btn-danger" onclick="deleteSSHKey(${row['id']})"> <i class="fas fa-trash"></i> Delete </button>
      </td>
    </tr>  
    `);
}

showSaveBtn = (id) => {
  $('#projKeySave_'+id).css('display','block');
}

deleteSSHKey = (id) => {
  ipcRenderer.send('delete-key', id);
}

deleteProject = (id) => {
  ipcRenderer.send('delete-project', id);
}

updateSSHKey = (id) => {
  let sshKeyId = $('#projKey_'+id).val();
  let obj = {'proj_id': id, 'sshkey_id': sshKeyId}
  ipcRenderer.send('update-project-ssh-key', obj);
}

addSSHKeysDropDown = () => {
  if(projectsCache.length > 0 && keysCache.length > 0) {
    $.each(projectsCache,(index,obj)=>{
      $('#projKey_'+obj['id']).empty();
      fillDropdownOptions($('#projKey_'+obj['id']), keysCache, 'id', 'name');
      console.log(obj);
      $('#projKey_'+obj['id']).val(obj['ssh_key_id']);
    })
  }
}

fillDropdownOptions = (elem, list, keyAttr, valueAttr) => {
  elem.append(`<option value="">Select</option>`)
  $.each(list,(index,obj) => {
    elem.append(`<option value="${obj[keyAttr]}"+>${obj[valueAttr]}</option>`);
  });

};

selectTargetForKey = () => {
  ipcRenderer.send('generate-key', null);
}

// Host github.com
//  HostName github.com
//  User git
//  AddKeysToAgent yes
//  IdentitiesOnly yes
//  IdentityFile c

// Host github.com-mini
//  HostName github.com
//  User git
//  AddKeysToAgent yes
//  IdentitiesOnly yes
//  IdentityFile ~/.ssh/miniflix