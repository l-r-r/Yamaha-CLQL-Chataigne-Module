var lastNotifyMsg = "";

// MonoIns, StIns, Mix, Matrix, DCA (MainOuts are always Stereo and Mono)
var currentChannelNumbers = [72, 8, 24, 8, 16];
var channelContainerNames = ["inputChannels", "stereoInputChannels", "mixOuts", "matrixOuts", "dCAs"];
var descriptionPrefixes = ["In", "StIn", "Mix", "Matrix", "DCA"];

function init()
{
	createChannel(local.values.getChild("mainOuts"), "Stereo", "st", "");
	createChannel(local.values.getChild("mainOuts"), "Mono", "mono", "");

	for(var j=0;j<5;j++)
	{
		var currChCont = local.values.getChild(channelContainerNames[j]);

		for(var i=0;i<currentChannelNumbers[j];i++)
		{
			createChannel(currChCont, int2Str_2Chars(i+1), (j==5)?"dca":"ch", descriptionPrefixes[j]);

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
				enableChannel(currChCont, int2Str_2Chars(i+1), (j==5)?"dca":"ch");
			}
		}
		else if(newChannelNumbers[j] < currentChannelNumbers[j])
		{
			for(var i=newChannelNumbers[j];i<currentChannelNumbers[j];i++)
			{
				disableChannel(currChCont, int2Str_2Chars(i+1), (j==5)?"dca":"ch");
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

		if((ptclPath != "") && (chanCont != "stereoInputChannels"))
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
			else if((value.name == "pan") && (chanCont == "inputChannels"))
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

	var dataSplit = data.split(' ');


	if((dataSplit[0] == "NOTIFY") && (dataSplit[1] == "set"))
	{
		// Store message to avoid infinite loop sending/receiving value
		lastNotifyMsg = data.substring(7,data.length-dataSplit[6].length-1);

		// Split path in data
		var cmdPathSplit = dataSplit[2].split(':')[1].split('/');
		
		var destContainer = local.values.getChild(ptclPath2Container(cmdPathSplit[1]));
		var dataExtractedValue = parseInt(dataSplit[5]);

		var lastPathElement = cmdPathSplit[cmdPathSplit.length-1];
		var secondLastPathElement = cmdPathSplit[cmdPathSplit.length-2];


		if(((lastPathElement == "Level") || (lastPathElement == "On") || (lastPathElement == "Pan"))  && (cmdPathSplit[1] != "StIn"))
		{
			var chanNum = 0;
			var rawChanNum = parseInt(dataSplit[3]);

			if(cmdPathSplit[1] == "StInCh")
			{
				if((rawChanNum % 2) == 0)
				{
					chanNum = (rawChanNum / 2) + 1;
				}
				else
				{
					return;
				}
			}
			else
			{
				chanNum = rawChanNum + 1;
			}

			var destChannel = destContainer.getChild(int2Str_2Chars(chanNum));

			if(secondLastPathElement == "Fader")
			{
				if(lastPathElement == "Level")
				{
					destChannel.level.set(int2dB(dataExtractedValue));
				}
				else if(lastPathElement == "On")
				{
					destChannel.on.set(dataExtractedValue);
				}
			}
			else if((lastPathElement == "Pan") && (secondLastPathElement == "ToSt"))
			{
				destChannel.pan.set(dataExtractedValue);
			}
			else 
			{
				if(secondLastPathElement == "ToMix")
				{

				}
				else if(secondLastPathElement == "ToMtrx")
				{

				}
			}
		}
	}
	else if(dataSplit[0] == "ERROR")
	{
		script.logError(data);
	}
	else
	{
		script.logWarning(data);
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

function ptclPath2Container(str)
{
	if(str == "InCh"){return "inputChannels";}
	else if((str == "StInCh") || (str == "StIn")){return "stereoInputChannels";}
	else if(str == "Mix"){return "mixOuts";}
	else if(str == "Mtrx"){return "matrixOuts";}
	else if(str == "DCA"){return "dCAs";}
	else{return "";}
}

function container2ptclPath(str)
{
	if(str == "inputChannels"){return "InCh";}
	else if(str == "stereoInputChannels"){return "StInCh";}
	else if(str == "mixOuts"){return "Mix";}
	else if(str ==  "matrixOuts"){return "Mtrx";}
	else if(str == "dCAs"){return "DCA";}
	else{return "";}
}


function sendMessage(message)
{
	local.send(message+"\n");
}
