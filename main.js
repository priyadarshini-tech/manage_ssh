const {app, BrowserWindow, remote, dialog, ipcMain} = require('electron');
const path = require('path');

const fs = require('fs');
const { exec } = require("child_process");
const SSHConfig = require('ssh-config');
const ini = require('ini');

const keygen = require('ssh-keygen');

let mainWindow;

const knex = require('knex')({
  client: 'sqlite3',
  connection: {
	filename: "./manage_ssh.sqlite"
  }
});

const sshd_template = `
Host host-placeholder
 HostName hostname-placeholder
 User user-placeholder
 AddKeysToAgent yes
 IdentitiesOnly yes
 IdentityFile identity-file-placeholder
`;

function createWindow(){
	mainWindow = new BrowserWindow({
		width: 1000,
		height: 1000,
		webPreferences: {
			nodeIntegration: true
		}
	});
	mainWindow.loadFile('renderer/views/index.html');

	mainWindow.openDevTools();

	initPage();
}

app.on('ready', createWindow);

initPage = () => {
	
		reloadProjects();
		loadSSHKeys();
	
}

loadProjects = () => {
	console.log(`loadProjects Called`)
	mainWindow.webContents.once('dom-ready', () => {
		knex('projects').select('*').then((rows) => {
			console.log(rows);
		  mainWindow.webContents.send('projects-fetched', rows);
		})
	})
	// Hack to fix when dom is already ready
	knex('projects').select('*').then((rows) => {
			console.log(rows);
		  mainWindow.webContents.send('projects-fetched', rows);
	})	
}

loadSSHKeys = () => {
	mainWindow.webContents.once('dom-ready', () => {
		knex('ssh_keys').select('*').then((rows) => {
			mainWindow.webContents.send('sshkeys-fetched', rows);
		})
	})
	// Hack to fix when dom is already ready
	knex('ssh_keys').select('*').then((rows) => {
			mainWindow.webContents.send('sshkeys-fetched', rows);
		})
}

reloadProjects = () => {

	knex('projects').select('*').then((rows) => {
		rows.forEach((row) => {
			let parsedData = parseGitConfig(row['path']+'/.git/config');
			// Do DB Update
			knex('projects').where({id: row['id']}).update({username: parsedData.username, email: parsedData.email, remote_user: parsedData.remote_user, host: parsedData.hostCleaned, hostname: parsedData.hostnameCleaned})
				.then((rows) => {
				console.log(`updated ${row['id']}`);
			  })
		});
		loadProjects();
		mainWindow.webContents.send('success-message', 'Updated successfully.');
	});

}

execCommand = (command) => {
	exec(command, (error, stdout, stderr) => {
    if (error) {
        console.log(`error: ${error.message}`);
        return;
    }
    if (stderr) {
        console.log(`stderr: ${stderr}`);
        return;
    }
    console.log(`stdout: ${stdout}`);
	});
}

ipcMain.on('select-project', async (event, arg)=>{
	result = await dialog.showOpenDialog(mainWindow,{
		title: 'Select a subtitles file.',
		properties: [ 'openDirectory' ]
	});

	var file = false
	if(result.filePaths != undefined){
		split_path = result.filePaths[0].split(path.sep);

		fs.readdir(result.filePaths[0], (err, files) => {
			if(files.includes('.git')){
				file = result.filePaths[0]
			}
			if(file) {
				split_path = file.split(path.sep);
				project_name = split_path[split_path.length - 1];
				knex('projects').where({ path: file }).then((rows) => {
					console.log(rows);
					if(rows.length == 0){

						parsedConfig = parseGitConfig(file+'/.git/config');

					  knex('projects').insert({name: project_name, path: file, username: parsedConfig.username, email: parsedConfig.email, remote_user: parsedConfig.remote_user, host: parsedConfig.hostCleaned, hostname: parsedConfig.hostnameCleaned})
						.then((rows) => {
							loadProjects();
							mainWindow.webContents.send('success-message', 'Added successfully');

						console.log(rows);
					  })
					  console.log(rows);
					}
			  });
			}
			mainWindow.webContents.send('folder-fetched', file);
	  });
	}
	else{mainWindow.webContents.send('folder-fetched', file);}
});

ipcMain.on('generate-config', async (event, arg) => {

	let filepath = app.getPath('home')+'/.ssh/config';

	// Check that the file exists locally
	if(!fs.existsSync(filepath)) {
		fs.writeFile(filepath, '', function(err) {
	    if(err) {
	      return console.log(err);
	    }
		}); 
	}

	fs.readFile(filepath, 'utf-8', (err, data) => {
		if(err){
			console.log("An error ocurred reading the file :" + err.message);
			return;
		}

		// Change how to handle the file content
		console.log("The file content is : " + data);
		const ssh_config = SSHConfig.parse(data);
		//console.log(ssh_config[0]['config']);

		knex('projects').then(function(rows) {

			rows.forEach( (row) => {

				let parsedData = ini.parse(fs.readFileSync(row['path']+'/.git/config', 'utf-8'));

				host = parsedData['remote "origin"']['url'].split('@')[1].split(':')[0];
				hostCleaned = host.split('-MSSH-')[0];

				parsedData['remote "origin"']['url'] = 
					parsedData['remote "origin"']['url'].replace(
							host,hostCleaned + getConfigIdentifier(row['name'], row['id']));

				// Parse Template
				let template = SSHConfig.parse(sshd_template)[0];

				//set values in Template
				knex('ssh_keys').where({id: row['ssh_key_id']}).first('path').then((ssh) => {
					if(ssh){
						template['value'] = row['host']+getConfigIdentifier(row['name'], row['id']);
						for (const line of template.config) {
						  if(line.param === 'HostName') {
							line.value = row['hostname'];
						  } else if(line.param === 'User') {
							line.value = row['remote_user'];
						  } else if(line.param === 'IdentityFile') {
							line.value = ssh['path'];
						  } 
						}
						console.log(template);
						try{ssh_config.remove({ Host: row['host']+getConfigIdentifier(row['name'],row['id']) });}catch(e){};
						ssh_config.push(template);
						
						writeGitConfig(row['path']+'/.git/config', parsedData);
						writeSSHConfig(ssh_config);
					}
				})
			});
			mainWindow.webContents.send('success-message', 'Generated successfully');
		});

	});
});





ipcMain.on('generate-key', async (event, arg) => {

	result = await dialog.showOpenDialog(mainWindow,{
		title: 'Select a Directory to save Keys',
		properties: [ 'openDirectory' ]
	});
	
	var file = false
	if(result.filePaths != undefined){
		keygen({
		  location: result.filePaths[0]+'/id_rsa_'+new Date().getTime()
		}, function(err, out){
		    if(err) return console.log('Something went wrong: '+err);
		    console.log('Keys created!');
		    mainWindow.webContents.send('key-generated', result.filePaths[0]);
		});
	}
});

ipcMain.on('save-key', async (event, arg)=>{
	file = arg['keyFile']
	execCommand('ssh-add '+ file);
	if(file) {
		knex('ssh_keys').where({ path: file }).then((rows) => {	
			if(rows.length == 0 ){

				knex('ssh_keys').insert({name: arg['name'], description: arg['description'], path: file}).then((rows) => {
					mainWindow.webContents.send('success-message', 'Key Added');
					mainWindow.webContents.send('key-saved', true);
					loadSSHKeys();
				}).catch(e => {
			    console.error(e);
			  });
				console.log(rows);
			} else {
				mainWindow.webContents.send('key-saved', false);
				mainWindow.webContents.send('error-message', 'Key Already Added');
			}
		});
	}
});

ipcMain.on('delete-project', async (event, arg)=>{
	console.log(`Delete project with id ${arg}`);
	knex('projects').where({ id: arg }).first().then((row) => {
		let filepath = app.getPath('home')+'/.ssh/config';
		fs.readFile(filepath, 'utf-8', (err, data) => {
			if(err){
				console.log("An error ocurred reading the file :" + err.message);
				return;
			}
			// Change how to handle the file content
			console.log("The file content is : " + data);
			const ssh_config = SSHConfig.parse(data);

			console.log(row['host']+getConfigIdentifier(row['name'],row['id']));
			try{ssh_config.remove({ Host: row['host']+getConfigIdentifier(row['name'],row['id']) });}catch(e){};
			writeSSHConfig(ssh_config);
		});

		let parsedData = ini.parse(fs.readFileSync(row['path']+'/.git/config', 'utf-8'));

		host = parsedData['remote "origin"']['url'].split('@')[1].split(':')[0];
		hostCleaned = host.split('-MSSH-')[0];

		parsedData['remote "origin"']['url'] = parsedData['remote "origin"']['url'].replace(host,hostCleaned);
		writeGitConfig(row['path']+'/.git/config', parsedData);

		knex('projects').where({ id: arg }).first().del().then(()=>{
			mainWindow.webContents.send('success-message', 'Deleted successfully.');
			loadProjects();
		})
		// Reload Keys on FrontEnd
	});
});

ipcMain.on('delete-key', async (event, arg)=>{
	console.log(`Delete Key with id ${arg}`);
	knex('projects').where({ ssh_key_id: arg }).then((prows) => {
		if(prows.length == 0){
			knex('ssh_keys').where({ id: arg }).del().then((rows) => {
				mainWindow.webContents.send('success-message', 'Deleted successfully.');
				// Reload Keys on FrontEnd
				loadSSHKeys();
			});
		}else{
			mainWindow.webContents.send('error-message', 'Key associated with project please release it first.');
		}
	});
});

ipcMain.on('update-project-ssh-key', async (event, arg)=>{
	console.log(`Set Key with ID ${arg.sshkey_id} for Project with ID ${arg.proj_id}`);
	knex('projects').where({id: arg.proj_id}).update({ssh_key_id: arg.sshkey_id}).then((rows) => {
		console.log(rows);
	});
	// Reload Projects on FrontEnd
	loadProjects();
});

ipcMain.on('reload-projects', async (event, arg)=>{ 
	reloadProjects();
});

parseGitConfig = (path) => {
	let parsedData = ini.parse(fs.readFileSync(path, 'utf-8'));
  if(parsedData["user"]) {
		username = parsedData["user"]["name"]
		email = parsedData["user"]["email"]
  } else { username = email = "" }

  if(parsedData['remote "origin"']){
	  remote_user = parsedData['remote "origin"']['url'].split('@')[0];
	  host = parsedData['remote "origin"']['url'].split('@')[1].split(':')[0];
	  hostCleaned = host.split('-MSSH-')[0];
	  hostname = parsedData['remote "origin"']['url'].split('@')[1].split(':')[0];
	  hostnameCleaned = host.split('-MSSH-')[0];
	} else{ remote_user = host = hostname = hostCleaned = hostnameCleaned = ""}

	return {
		username: username,
		email: email,
		remote_user: remote_user,
		host: host,
		hostCleaned: hostCleaned,
		hostname: hostname,
		hostnameCleaned: hostnameCleaned
	};
}

getConfigIdentifier = (name, id) => {
	return `-MSSH-${id}-${name}`;
}

writeSSHConfig = (ssh_config) => {
	config_content = SSHConfig.stringify(ssh_config);
	fs.writeFile(app.getPath('home')+'/.ssh/config', config_content, function(err) {
	    if(err) {
	        return console.log(err);
	    }
	    console.log("The file was saved!");
	}); 
}

writeGitConfig = (path, git_config) => {
	fs.writeFileSync(path, ini.stringify(git_config));
}