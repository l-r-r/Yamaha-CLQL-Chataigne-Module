var lastNotifyMsg = "";

// MonoIns, StIns, Mix, Matrix, DCA (MainOuts are always Stereo and Mono)
var currentChannelNumbers = [72, 8, 24, 8, 16];
var channelContainerNames = ["monoIns", "stereoIns", "mixOuts", "matrixOuts", "dCAs", "masterOuts"];
var descriptionPrefixes = ["In", "StIn", "Mix", "Matrix", "DCA", "St"];


var pathToContainer = util.readFile("~/Documents/Chataigne/modules/Yamaha-CLQL-Chataigne-Module/pathToContainer.json", true);



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
			rebuildConsole(param.getData());
		}
	}
}


function rebuildConsole(model)
{
	// MonoIns, StIns, Mix, Matrix, DCA (MainOuts are always Stereo and Mono)
	var newChannelNumbers  = [0, 0, 0, 0, 0];

	// If "none", array stay null, and all the channel parameters 
	if( model =="cl1" ){ newChannelNumbers = [56, 8, 24, 8, 16]; }
	else if( model =="cl3" ){ newChannelNumbers = [64, 8, 24, 8, 16]; }
	else if( model =="cl5" ){ newChannelNumbers = [72, 8, 24, 8, 16]; }
	else if( model =="ql1" ){ newChannelNumbers = [32, 8, 16, 8, 8]; }
	else if( model =="ql5" ){ newChannelNumbers = [64, 8, 16, 8, 8]; }


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
		var msg = "";
		// If it's an input channel
		var chanCont = value.getParent().getParent().name;
		var ptclPath = container2ptclPath(chanCont);

		if((ptclPath != "") && (chanCont != "stereoIns"))
		{
			// Get the channel number from the number of the container, "-1" to change to correct range for protocol
			script.log(value.getParent().name);
			script.log("parseInt : "+parseInt(value.getParent().name));
			var chanNum = parseInt(value.getParent().name) - 1;

			msg = "set MIXER:Current/"+ptclPath+"/";

			// If it's an on/off command	
			if(value.name == "on")
			{
				msg += "Fader/On "+chanNum+" 0 "+value.get();
			}
			// If it's a level command
			else if(value.name == "level")
			{
				msg += "Fader/Level "+chanNum+" 0 "+dB2int(value.get());
			}
			else if((value.name == "pan") && (chanCont == "monoIns"))
			{
				msg += "ToSt/Pan "+chanNum+" 0 "+value.get();
			}
			else
			{
				msg = "";
			}	
		}

		// Avoid resending message to console after receiving a notification
		if((msg != lastNotifyMsg) && (msg != "")) 
		{
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
	//								    /!\  Current/MuteMaster/On, so prefer use of "cmdPathSplit.length-x" instead of direct index
	//										 0       1.         2. 

	var msgRcvd = JSON.parse('{"category":"", "action": "", "target":"", "path":[], "params": {"x":0, "y":0, "z":0}, "strValue":""}');
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
				var totalPathSplit = dataSplit[i+2].split(':');

				msgRcvd['target'] = totalPathSplit[0];
				msgRcvd['path'] = totalPathSplit[1].split('/');

				msgRcvd['params']['x'] == dataSplit[i+3];

				if((msgRcvd['action'] == "get") || (msgRcvd['action'] == "set"))
				{
					msgRcvd['params']['y'] == dataSplit[i+4];
					msgRcvd['params']['z'] == dataSplit[i+5];

					msgRcvd['strValue'] == dataSplit[i+6];
					i += 7;
				}
				else
				{
					msgRcvd['params']['y'] == 0;
					msgRcvd['params']['z'] == 0;

					msgRcvd['strValue'] == "";
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
	var valueContainer = root.values;
	var jsonCursor = pathToContainer;

	var containerName = "";

	for(var i=1;i<msg['path'].length;i++)
	{
		if(true)
		{

		}
	}

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


function container2ptclPath(str)
{
	if(str == "monoIns"){return "InCh";}
	else if(str == "stereoIns"){return "StInCh";}
	else if(str == "mixOuts"){return "Mix";}
	else if(str ==  "matrixOuts"){return "Mtrx";}
	else if(str == "dCAs"){return "DCA";}
	else{return "";}
}


function sendMessage(message)
{
	local.send(message+"\n");
}
