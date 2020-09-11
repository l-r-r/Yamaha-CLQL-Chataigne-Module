var debug = true;
var locked = false;


var chContainerNames = ["monoIns", "stereoIns", "mixOuts", "matrixOuts", "dCAs", "muteGroups"];
var descriptionPrefixes = ["In", "StIn", "Mix", "Matrix", "DCA", "Mute"];

var currentModel;


var pathToValue = util.readFile("pathToValue.json", true, true);
var valueToPath = util.readFile("valueToPath.json", true, true);



function init()
{
	if(debug){ local.scripts.yamahaCLQL.enableLog.set(true); }

	var models = util.readFile("models.json", true, true);
	var currentModelName = local.parameters.model.get();

	currentModel = models[currentModelName];
	buildConsole(currentModelName);

	// TESTING ZONE

}


function moduleParameterChanged(param)
{
	if(param.isParameter())
	{
		if(param.name == "model")
		{
			buildConsole(param.get());
		}
	}
}


function buildConsole(newModelName)
{
	if(debug){var startTime = util.getTime();}

	var models = util.readFile("models.json", true, true);
	var newModel = models[newModelName];

	var currentModelChCount;
	var newModelChCount;

	var chContainer;
	var newCh;
	var newChIndexStr;

	// test if a console was already built or not
	// send an exception in the log if not, so maybe there is a better solution to find :)
	var firstBuild = (local.values.monoIns.getChild("01") == undefined);

	if(firstBuild)
	{
		//Build Stereo master
		newCh = local.values.masterOuts.addContainer("Stereo");
		newCh.addBoolParameter("On", "Stereo master's on", true);
		newCh.addIntParameter("Balance", "Stereo master's balance", 0, -63, 63);
		newCh.addIntParameter("Level", "Stereo master's level", 0, -32768, 1000);


		//Build Mono master
		newCh = local.values.masterOuts.addContainer("Mono");
		newCh.addBoolParameter("On", "Mono master's on", true);
		newCh.addIntParameter("Level", "Mono master's level", 0, -32768, 1000);
	}


	for(var i=0;i<6;i++)
	{
		currentModelChCount = (firstBuild)?0:currentModel[chContainerNames[i]];
		newModelChCount = newModel[chContainerNames[i]];

		chContainer = local.values.getChild(chContainerNames[i]);
		
		if(newModelChCount > currentModelChCount)
		{

			for(var j=currentModelChCount;j<newModelChCount;j++)
			{
				newChIndexStr = int2Str_2Chars(j+1);
				newCh = chContainer.addContainer(newChIndexStr);

				newCh.addBoolParameter("On", descriptionPrefixes[i]+newChIndexStr+"'s on", true);

				if((chContainerNames[i] == "monoIns") || (chContainerNames[i] == "stereoIns") || (chContainerNames[i] == "mixOuts"))
				{
					newCh.addIntParameter("Pan", descriptionPrefixes[i]+newChIndexStr+"'s pan", 0, -63, 63);
				}

				if((chContainerNames[i] == "stereoIns") || (chContainerNames[i] == "mixOuts") || (chContainerNames[i] == "matrixOuts"))
				{
					newCh.addIntParameter("Balance", descriptionPrefixes[i]+newChIndexStr+"'s balance", 0, -63, 63);
				}

				if(chContainerNames[i] != "muteGroups")
				{
					newCh.addIntParameter("Level", descriptionPrefixes[i]+newChIndexStr+"'s level", 0, -32768, 1000);
				}
			}
		}
		else if(newModelChCount < currentModelChCount)
		{
			for(var j=newModelChCount;j<currentModelChCount;j++)
			{
				chContainer.removeContainer(int2Str_2Chars(j+1));
			}
		}
	}

	currentModel = newModel;

	if(debug){script.log("Execution time : "+(util.getTime()-startTime)+"s");}
}


function syncConsole()
{

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
			if(debug){ script.logWarning("Received : "+data); }
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

			var index = jsonCursor['index'];
			if(index != undefined)
			{
				valueContainer = valueContainer.getChild(int2Str_2Chars((msg['params'][index]+1)));
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
