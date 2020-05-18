var debug = true;
var locked = false;

// MonoIns, StIns, Mix, Matrix, DCA (MainOuts are always Stereo and Mono)
var currentChannelNumbers = [72, 8, 24, 8, 16];
var channelContainerNames = ["monoIns", "stereoIns", "mixOuts", "matrixOuts", "dCAs", "masterOuts"];
var descriptionPrefixes = ["In", "StIn", "Mix", "Matrix", "DCA", "St"];


var pathToValue = util.readFile("~/Documents/Chataigne/modules/Yamaha-CLQL-Chataigne-Module/pathToValue.json", true);
var valueToPath = util.readFile("~/Documents/Chataigne/modules/Yamaha-CLQL-Chataigne-Module/valueToPath.json", true);



function init()
{
	createChannel(local.values.getChild("masterOuts"), "Stereo", "st", "");
	createChannel(local.values.getChild("masterOuts"), "Mono", "mono", "");

	var chType = "";

	for(var j=0;j<5;j++)
	{
		var currChCont = local.values.getChild(channelContainerNames[j]);

		chType = (j==4)?"dca":"ch";

		for(var i=0;i<currentChannelNumbers[j];i++)
		{
			createChannel(currChCont, int2Str_2Chars(i+1), chType, descriptionPrefixes[j]);

			// Disabling all the channels at the creation of the module to force to choose a model
			//disableChannel(currChCont, int2Str_2Chars(i+1), (j==5)?"dca":"ch");
		}
	}


	// TESTING ZONE

}


function createChannel(container, name, type, descriptionPrefix)
{
	var newCh = container.addContainer(name);
	newCh.addBoolParameter("On", descriptionPrefix+name+"'s mute", true);
	if(type!="dca" && type!="mono")
	{ 
		newCh.addIntParameter("Pan", descriptionPrefix+name+"'s pan", 0, -63, 63);
	}
	newCh.addIntParameter("Level", descriptionPrefix+name+"'s level", 0, -32768, 1000);
}


function moduleParameterChanged(param)
{
	if(param.isParameter())
	{
		if(param.name == "model")
		{
			rebuildConsole(param.get());
		}
	}
}


function rebuildConsole(model)
{
	// MonoIns, StIns, Mix, Matrix, DCA (MainOuts are always Stereo and Mono)
	var newChannelNumbers  = [0, 0, 0, 0, 0];

	// If "none", array stay null, and all the channel parameters 
	if( model =="CL1" ){ newChannelNumbers = [56, 8, 24, 8, 16]; }
	else if( model =="CL3" ){ newChannelNumbers = [64, 8, 24, 8, 16]; }
	else if( model =="CL5" ){ newChannelNumbers = [72, 8, 24, 8, 16]; }
	else if( model =="QL1" ){ newChannelNumbers = [32, 8, 16, 8, 8]; }
	else if( model =="QL5" ){ newChannelNumbers = [64, 8, 16, 8, 8]; }


	for(var j=0;j<5;j++)
	{
		var currChCont = local.values.getChild(channelContainerNames[j]);

		if(newChannelNumbers[j] > currentChannelNumbers[j])
		{
			for(var i=currentChannelNumbers[j];i<newChannelNumbers[j];i++)
			{
				enableChannel(currChCont, int2Str_2Chars(i+1), (j==4)?"dca":"ch");
			}
		}
		else if(newChannelNumbers[j] < currentChannelNumbers[j])
		{
			for(var i=newChannelNumbers[j];i<currentChannelNumbers[j];i++)
			{
				disableChannel(currChCont, int2Str_2Chars(i+1), (j==4)?"dca":"ch");
			}
		}
	}


	currentChannelNumbers = newChannelNumbers;
}


function enableChannel(container, name, type)
{
	var ch = container.getChild(name);

	ch.on.setAttribute("enabled", true);
	ch.level.setAttribute("enabled", true);

	if(type!="dca")
	{ 
		ch.pan.setAttribute("enabled", true);
	}
}


function disableChannel(container, name, type)
{
	var ch = container.getChild(name);

	ch.on.setAttribute("enabled", false);
	ch.level.setAttribute("enabled", false);

	if(type!="dca")
	{ 
		ch.pan.setAttribute("enabled", false);
	}
}


// Sending new values to console
function moduleValueChanged(value)
{
	if(value.isParameter())
	{
		// Lock mechanism to avoid resending message to the console when updte a value after receinving a "NOTIFY set" command
		if(!locked)
		{	
			var msg = "set ";
			var path = "";

			var z = value.get();

			var targetCh = JSON.parse('{ "x":0, "y":0 }');

			var jsonCursor = valueToPath[value.niceName];
			var pathroot = jsonCursor['pathroot'];

			var parent = value.getParent();
			var indexNum = 0;

			while(parent.name != 'values')
			{
				indexNum = parseInt(parent.name, true);

				if(indexNum)
				{
					parent = parent.getParent();
					jsonCursor = jsonCursor[ parent.name ];
					targetCh[ jsonCursor['index'] ] = (indexNum-1);
					path = jsonCursor['path']+path;
				}

				parent = parent.getParent();
				
			}

			msg += pathroot+path+value.niceName;

			msg += " "+targetCh['x'];
			msg += " "+targetCh['y'];

			if(value.niceName == "Level")
			{
				z = dB2int(z);
			} 

			msg += " "+z;

			sendMessage(msg);
		}
	}
}


// Receiving data from console and update values of the module
function dataReceived(data)
{
	// Memo of strucure of a notification send by the console and index of different parts of splits
	//
	// 	data				NOTIFY set MIXER:Current/InCh/Fader/On 0 0 1 "ON"
	// 	dataSplit			0      1.  2.                          3 4 5 6
	// 	cmdPathSplit						 0.      1.   2.    3
	//
	//								    /!\  Current/MuteMaster/On. 
	//										 0       1.         2. 

	if(debug)
	{
		script.log(data);
	}

	var msgRcvd = JSON.parse('{"category": "", "action": "", "path": [], "params": {"x":0, "y":0, "z":0}, "strValue": ""}');
	var dataSplit = data.split(' ');

	var i = 0;

	while( i < dataSplit.length)
	{

		msgRcvd['category'] = dataSplit[i];

		if((msgRcvd['category'] == "NOTIFY") || (msgRcvd['category'] == "OK"))
		{
			msgRcvd['action'] = dataSplit[i+1];

			//Don't handle "OK set", to be checked when upgrade to support recalling libraries
			if((msgRcvd['category'] == "NOTIFY") || ((msgRcvd['category'] == "OK") && (msgRcvd['action'] == "get")))
			{
				var pathSplit = dataSplit[i+2].split(':');
				var endPathSplit = pathSplit[1].split('/');

				msgRcvd['path'].push(pathSplit[0]);
				for(var j=0;j<endPathSplit.length;j++)
				{
					msgRcvd['path'].push(endPathSplit[j]);
				}

				msgRcvd['params']['x'] = parseInt(dataSplit[i+3], true);

				if((msgRcvd['action'] == "get") || (msgRcvd['action'] == "set"))
				{
					msgRcvd['params']['y'] = parseInt(dataSplit[i+4], true);
					msgRcvd['params']['z'] =parseInt(dataSplit[i+5], true);

					msgRcvd['strValue'] = dataSplit[i+6];
					i += 7;
				}
				else
				{
					msgRcvd['params']['y'] = 0;
					msgRcvd['params']['z'] = 0;

					msgRcvd['strValue'] = "";
					i += 4;
				}

				processMsgRcvd(msgRcvd);
			}
		}
		else if(msgRcvd['category'] == "ERROR")
		{
			script.logError("Received : "+data);
			i = dataSplit.length;
		}
		else
		{
			// For debugging purposes...
			script.logWarning("Received : "+data);
			i = dataSplit.length;
		}
	}
}


function processMsgRcvd(msg)
{
	var valueContainer = local.values;
	var jsonCursor = pathToValue;

	var msgLength = msg['path'].length;

	for(var i=0;i<msgLength-1;i++)
	{
		jsonCursor = jsonCursor[msg['path'][i]];
		var containerName = jsonCursor['container'];

		if(containerName != undefined)
		{
			valueContainer = valueContainer.getChild(containerName);
			//if(debug){script.log(valueContainer.getControlAddress());}

			var index = jsonCursor['index'];
			if(index != undefined)
			{
				valueContainer = valueContainer.getChild(int2Str_2Chars((msg['params'][index]+1)));
				//if(debug){script.log(valueContainer.getControlAddress());}
			}
		}
	}

	var targetValue = msg['path'][msgLength-1];
	var z = msg['params']['z'];

	if(targetValue == "Level")
	{
		z = int2dB(z);
	}

	locked = true; 
	valueContainer.getChild(targetValue).set(z);
	locked = false;
}


function getValueCallback(command)
{
	sendMessage("get "+command);
}

function setValueCallback(command)
{
	sendMessage("set "+command);
}


// TODO : Implement conversion between protocol values and real values
function int2dB(i)
{
	return i;
}

function dB2int(i)
{
	return i;
}


// Return a 2-characters string from an integer (0-99)
function int2Str_2Chars(number)
{
	return (number < 10)?("0"+number):(""+number);
}


function sendMessage(message)
{
	local.send(message+"\n");
	if(debug)
	{
		script.log(message);
	}
}
