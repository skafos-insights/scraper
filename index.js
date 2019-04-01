// Reading PDFS? No. Just do pdf2text -- there isn't any useful metadata inside the PDF text surprisingly.
// var pdfreader = require("pdfreader");

// new pdfreader.PdfReader().parseFileItems("MINS_20190122Jan22DRAFT.pdf", function( err, item ) {
//   if(item && item.R) {
//     if(item.R[0].TS[2] == 1) {
//       console.log("\n # ", item.text)
//     } else {
//       process.stdout.write(item.text + " ")
//     }
//   }
// });

const request = require('request')
const progress = require('request-progress');
const cheerio = require('cheerio')
const _ = require('lodash')
const async = require('async')
const fs = require('fs')
const mkdirp = require('mkdirp')
const Fuse = require('fuse.js')
const filenamifylib = require('filenamify')
const { exec } = require('child_process');

const filenamify = function(str, opt){return filenamifylib(str, (opt ? opt : {replacement: '-'})).replace(/['\$]/g,"")}

// This pulls the HTML agendas but there aren't actually that many of them
//
// request('http://charlottesville.granicus.com/ViewPublisher.php?view_id=2', function (error, response, body) {
//   console.log('error:', error); // Print the error if one occurred
//   console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
//   const $ = cheerio.load(body)

//   const links = $("a[href*='AgendaViewer']").map( (i,el) => $(el).attr("href") ).get()
//   console.log(links)
// });

const headers = {
  'User-Agent': 'Chrome'
};

function downloadAgenda(agenda_url, cb) {
  const options = {
    url: `http://www.charlottesville.org${agenda_url}`,
    encoding: null,
    headers
  }
  request(options, function (error, response, body) {
    if(error) console.error(error)
    const filename = "agendas/"+_.last(agenda_url.split('='))+".pdf"
    fs.writeFile(filename, body, cb)
  })
}

function downloadMinute(minute_url, cb) {
  const options = {
    url: `http://www.charlottesville.org${minute_url}`,
    encoding: null,
    headers
  }
  request(options, function (error, response, body) {
    if(error) console.error(error)
    const filename = "minutes/"+_.last(minute_url.split('='))+".pdf"
    fs.writeFile(filename, body, cb)
  })
}

function downloadAgendas(err, agenda_urls) {
  if(err) console.error(err);
  const MAX_CONNECTIONS = 10
  mkdirp('agendas', () => {
    async.eachLimit(_.flatten(agenda_urls), MAX_CONNECTIONS, downloadAgenda)
  })
}

function downloadMinutes(err, minutes_urls) {
  if(err) console.error(err);
  const MAX_CONNECTIONS = 10
  mkdirp('minutes', () => {
    async.eachLimit(_.flatten(minutes_urls), MAX_CONNECTIONS, downloadMinute)
  })
}
var escapeShell = function(cmd) {
  return '"'+cmd.replace(/(["'$`\\])/g,'\\$1')+'"';
  // return '"'+cmd.replace(/(["\s'$`\\])/g,'\\$1')+'"';
}
function downloadAgendaMetaViewer(agenda_url, cb) {
  const options = {
    url: agenda_url,
    encoding: null,
    headers
  }
  request(options, function (error, response, body) {
    if(error) console.error(error)
    const filename = "agendas/"+_.last(agenda_url.split('='))+".pdf"
    fs.writeFile(filename, body, cb)
  })
}
function fillAgendaDurations(meeting){
	var agendaItems = _.filter(meeting.agenda, function(value){
		return value.timestamp !== undefined;
	});
	var agendaItems = _.orderBy(agendaItems, 'timestamp','asc');
	  console.log("agendaItems: "+agendaItems.length)
	if(agendaItems.length == 0){
		return;
	}
	for(var x in agendaItems){
		var nextIndex = parseInt(x)+1;
		if(nextIndex < agendaItems.length){
			agendaItems[x].duration = agendaItems[nextIndex].timestamp-agendaItems[x].timestamp
		}
	}
}
const VIDEO_DIRECTORY = "E:/CouncilParser/"
function cutClip(meeting, agendaItems, agendaItem, x, cb){
	// console.log("cutClip", arguments)
	var nextIndex = parseInt(x)+1;
	var directory = "videos/"+meeting.meeting_body+"/"+dateToISO(meeting.date);
	var path = directory+"/"+filenamify(meeting.name+" Pt. "+nextIndex+" "+agendaItem.item_name)+".mp4";
	agendaItem.video_file = path;
	
	if (fs.existsSync(VIDEO_DIRECTORY+agendaItem.video_file)) {
		console.log("Clip exists: "+agendaItem.video_file)
		cb();
		return;
	}
	console.log("Clip does not exist: "+agendaItem.video_file);
	
	var command = "ffmpeg -y -hwaccel cuvid -c:v h264_cuvid -i "+escapeShell(VIDEO_DIRECTORY+meeting.video_file)+" -vcodec h264_nvenc -preset slow -c copy";
	command += " -ss "+agendaItem.timestamp;
	if(nextIndex < agendaItems.length){
		command += " -t "+agendaItem.duration;
	}
	command += " "+escapeShell(VIDEO_DIRECTORY+path);
	var item = agendaItems[x];
	
	console.log(command)
	exec(command, {maxBuffer: 1024 * 1000}, (error, stdout, stderr) => {
		if (error) {
			console.error(`exec error: ${error}`);
			cb(`exec error: ${error}`, agendaItem);
			fs.unlink(VIDEO_DIRECTORY+path, function(){console.log('video deleted', VIDEO_DIRECTORY+path, arguments)})
			return;
		}
		console.log(`stdout: ${stdout}`);
		console.log(`stderr: ${stderr}`);
		cb(null, agendaItem);
	});
}
function cutVideo(meeting, cb){
	  console.log("cutVideo: "+meeting.video_file)
	var agendaItems = _.filter(meeting.agenda, function(value){
		return value.timestamp !== undefined;
	});
	var agendaItems = _.orderBy(agendaItems, 'timestamp','asc');
	  console.log("agendaItems: "+agendaItems.length)
	if(agendaItems.length == 0){
		cb();
		return;
	}
	  console.log(agendaItems[0])
	  console.log(agendaItems[1])
	
	
	const MAX_CONNECTIONS = 5
	async.eachOfLimit(agendaItems, MAX_CONNECTIONS, cutClip.bind(null, meeting, agendaItems),function(err){
		if(err) {
			console.log('Video Download Errors: '+err);
			cb();
			return;
		}
		setTimeout(cb, Math.random()*30);
	})
	/*var directory = VIDEO_DIRECTORY+"videos/"+meeting.meeting_body+"/"+meeting.date.replace(/\//g,"-").replace(/ /g,"_");
	for(var x in agendaItems){
		var command = "ffmpeg -y -hwaccel nvdec -i "+escapeShell(meeting.video_file)+" -vcodec h264_nvenc -preset slow -level 4.1 -qmin 10 -qmax 52 -c copy";
		// var command = "ffmpeg -y -i "+escapeShell(meeting.video_file)+" -c copy";
		command += " -ss "+agendaItems[x].timestamp;
		var nextIndex = parseInt(x)+1;
		if(nextIndex < agendaItems.length){
			command += " -t "+agendaItems[x].duration;
		}
		var filename = filenamify(meeting.name+" Pt. "+nextIndex+" "+agendaItems[x].item_name)+".mp4";
		command += " "+escapeShell(directory+"/"+filename);
		var item = agendaItems[x];
		
		console.log(command)
		exec(command, {maxBuffer: 1024 * 1000}, (error, stdout, stderr) => {
			if (error) {
				console.error(`exec error: ${error}`);
			}
			console.log(`stdout: ${stdout}`);
			console.log(`stderr: ${stderr}`);
			item.video = filename;
		});
	}*/
	// setTimeout(cb, Math.random()*20000);
}
function dateToISO(date){
	return date.replace(/\//g,"-").replace(/ /g,"_").replace(/(\d{2})-(\d{2})-(\d{2})/g, "20$3-$1-$2");
}
function downloadVideo(meeting, cb) {
  if(!meeting.video){
	  console.log("No video: "+meeting.name)
	  cb();
	  return;
  }
  const options = {
    url: meeting.video,
    encoding: null,
    headers
  }
  var directory = "videos/"+filenamify(meeting.meeting_body)+"/"+filenamify(dateToISO(meeting.date));
  meeting.video_file = directory+"/"+filenamify(meeting.name)+".mp4";
  if (fs.existsSync(VIDEO_DIRECTORY+meeting.video_file)) {
	  console.log("File exists: "+meeting.video_file)
	  cutVideo(meeting, cb);
	  // cb(); // USE IF SKIPPING cutVideo
	  return;
  }
  console.log("no video exists", meeting)
  // cb();return;
  mkdirp(VIDEO_DIRECTORY+directory, () => {
		progress(request(options))
		.on('progress', function (state) {
			console.log(meeting.name, state);
		})
		.on('error', function (error) {
			console.error('error')
			console.error(error)
			cb();
			return;
		})
		.on('end', function (state) {
			console.error('end')
			console.log(meeting.name, state);
			cutVideo(meeting, cb);
		})
		.pipe(fs.createWriteStream(VIDEO_DIRECTORY+meeting.video_file));
  })
}

/*
async.map(_.range(2014,2020), (year, cb) => {
  const options = {
    url: `http://www.charlottesville.org/departments-and-services/departments-a-g/city-council/council-agendas/${year}-council-agendas`,
    headers
  }

  request(options, function (error, response, body) {
    const $ = cheerio.load(body)
    const links = $("a")
      .filter( (i,el) => $(el).text().indexOf("agenda only") >= 0 )
      .map( (i,el) => $(el).attr("href") )
      .get()
    cb(null,links)
  })
}, downloadAgendas)

async.map(_.range(2014,2020), (year, cb) => {
  const options = {
    url: `http://www.charlottesville.org/departments-and-services/departments-a-g/city-council/council-records/council-minutes/${year}-council-minutes`,
    headers
  }

  request(options, function (error, response, body) {
    const $ = cheerio.load(body)
    const links = $(".content_area ul a")
      .map( (i,el) => $(el).attr("href") )
      .get()
    console.log(links)
    cb(null,links)
  })
}, downloadMinutes)
*/

var Bodies = [
	{
		regexes: [/BAR/i, /Architectural/i],
		name: "Board of Architectural Review"
	},
	{
		regexes: [/Council/i],
		name: "City Council"
	},
	{
		regexes: [/Planning/i],
		name: "Planning Commission"
	},
	{
		regexes: [/CRHA/i, /Redevelop/i],
		name: "CRHA"
	},
	{
		regexes: [/VFB/i],
		name: "VFB"
	},
	{
		regexes: [/VFH/i],
		name: "VFH"
	},
	{
		regexes: [/Our Town/i],
		name: "Our Town Cville"
	}
];
function getGranicusView(){
	const options = {
		url: `https://charlottesville.granicus.com/ViewPublisher.php?view_id=2`,
		headers
	}

	request(options, function (error, response, body) {
		const $ = cheerio.load(body)
		const years = $(".TabbedPanelsTab ")
		  .map( (i,el) =>  $(el).text() )
		  .get()
		
		var meetings = $(".TabbedPanelsContent")
		  .map( (i,el) => {
			  return $('.listingTable tbody tr', el) .map( (n,tr) => {
				  // console.log( $(tr).find('td').length );
				  // console.log( $(tr).children().first().text().trim());
				  // console.log( $('td',tr).get().length);
				  // console.log( $($('td',tr).get()).text().trim());
				  var name = $(tr).find('td.listItem:first-child').text().trim();
				  var url = $(tr).find('td.listItem:nth-child(6) a:last-child').attr('href');
				  var clip_id = (url ? /clip_id=(\d+)&/.exec(url)[1] : null);
				  var duration = $(tr).find('td.listItem:nth-child(3)').text().trim();
				  var meeting_body = null;
				  for(var x in Bodies){
						for(var y in Bodies[x].regexes){
							if(Bodies[x].regexes[y].test(name)){
								meeting_body = Bodies[x].name;
								continue;
							}
						}
						if(meeting_body !== null)
							continue;
				  }
				  return {
					  name: name,
					  meeting_body: meeting_body,
					  year: years[i],
					  date: $('td.listItem:nth-child(2)',tr).get(0).childNodes[1].nodeValue.trim(),
					  timestamp: $(tr).find('td.listItem:nth-child(2) span').text().trim(),
					  clip_id: clip_id,
					  media_player: "https://charlottesville.granicus.com/MediaPlayer.php?view_id=2&clip_id="+clip_id,
					  agenda_viewer: ($(tr).find('td.listItem:nth-child(4) a').length ? "https://charlottesville.granicus.com/GeneratedAgendaViewer.php?view_id=2&clip_id="+clip_id : undefined),
					  // agenda_viewer: $(tr).find('td.listItem:nth-child(4) a').attr('href'),
					  duration: duration.replace(' ',' '),
					  duration_minutes: parseInt(/(\d\d)h (\d\d)m/i.exec(duration)[1])*60+/(\d\d)h (\d\d)m/i.exec(duration)[2],
					  video: $(tr).find('td.listItem:last-child a').attr('href')
				  };
			  }).get()
		  })
		  .get()
		
		// var callback = function(obj){}
		// var minutesMeetings = _.reject(meetings, {agenda_viewer: undefined});
		var meetings = _.filter(meetings, {meeting_body: "City Council"}); //EXCLUDE NON-COUNCIL
		// meetings = _.slice(meetings, 0, 10); //TESTING ONLY
		// meetings = _.slice(meetings, 143); //SCRAPING ONLY
		
		const MAX_CONNECTIONS = 10
		async.eachLimit(meetings, MAX_CONNECTIONS, getAgendaItems,function(err){
			if(err)  console.log('Agenda Item Errors: '+err);
			async.eachLimit(meetings, MAX_CONNECTIONS, getAgendaTimestamps,function(err){
				if(err)  console.log('Agenda Timestamp Errors: '+err);
				writeMeetingsToFiles(meetings);
				async.eachLimit(meetings, 1, downloadVideo,function(err){
					if(err)  console.log('Video Download Errors: '+err);
					writeMeetingsToFiles(meetings);
				})
			})
		})
	})
}

function parseAgendaItem(i,el,$){
	  var documentDivs = $(el).next().next('blockquote:has("> div > a")');
	  var childItemDivs = $(el).next().next('blockquote:has("> table")');
	  // console.log($(el).find('> strong, td:not(.numberspace) strong').first().text().trim());
	  // console.log(documentDivs.length);
	  // console.log( $(el).next().next('blockquote').length);
	  // console.log(documentDivs.first().text().trim());
	  // console.log(childItemDivs.length);
	  // console.log(childItemDivs.first().text().trim());
	  var childItems = childItemDivs
		  .map( (i,el) => {
			  // console.log(el);
			  return $(el).find('table')
				.map( (i,el) => {
					return parseAgendaItem(i,el,$) 
				}).get()
		  })
		  .get()
	  // console.log(childItems);
	  
	  documents = $('a', documentDivs).map((n,a) => {
		  // console.log($(a).text().trim());
		  console.log( $(a).attr('href'));
		  return {
			  document_name: $(a).text().trim(),
			  document_url: $(a).attr('href')
		  }
	  }).get();
	  return {
		  item_name: $(el).find('> strong, td:not(.numberspace) strong').first().text().trim(),
		  documents: (documents.length ? documents : undefined),
		  children: (childItems.length ? childItems : undefined)
	  }
}

function getAgendaTimestamps(meeting, cb){
	if(!meeting.media_player){
		cb(null, meeting)
		return;
	}
	const options = {
		url: meeting.media_player,
		headers
	}
	var fuseOptions = {
		shouldSort: true,
		tokenize: true,
		includeMatches: true,
		threshold: 0,
		location: 0,
		distance: 100,
		maxPatternLength: 180,
		minMatchCharLength: 12,
		keys: [
			"item_name"
		]
	};
	request(options, function (error, response, body) {
		if(error) console.error(error)
		const $ = cheerio.load(body)
		
		$('.indexPoints a[time]')
		  .each( (i,el) => {
			var noTimestamps =_.filter(meeting.agenda, function(value){
				return value.timestamp === undefined;
			});
			var fuse = new Fuse(noTimestamps, fuseOptions);
			var item = $(el).text().trim();
			var timestamp = parseInt($(el).attr("time"));
			  // console.log(meeting.agenda.length);
			  // console.log(_.filter(meeting.agenda, {item_name: item}).length);
			var results = fuse.search(item);
			// var agenda_item = _.find(meeting.agenda, {item_name: item});
			if(results.length == 0 || results[0].matches.length == 0){
				console.log("NO MATCH", item, _.find(meeting.agenda, {item_name: item}))
				if(typeof meeting.agenda === 'undefined'){
					meeting.agenda = [];
				}
				var agenda_item = {
					"item_name": item
				};
				meeting.agenda.push(agenda_item)
			}else{
				var agenda_item = results[0].item;
				if(item != agenda_item['item_name']){
					console.log("MATCH")
					console.log(item)
					console.log(agenda_item['item_name'])
					// console.log(JSON.stringify(results[0]))
				}
			}
			agenda_item.timestamp = timestamp;
		  })
		  .get()
		
		// var full =_.filter(meeting.agenda, function(value){
			// return value.timestamp !== undefined;
		// });
		// console.log("full: ", full.length);
		fillAgendaDurations(meeting);
		cb(null, meeting)
	})
}
function getAgendaItems(meeting, cb){
	console.log(meeting.name)
	if(!meeting.agenda_viewer){
		cb(null, meeting)
		return;
	}
	const options = {
		url: meeting.agenda_viewer,
		headers
	}

	request(options, function (error, response, body) {
		if(error) console.error(error)
		const $ = cheerio.load(body)
		
		// console.log($('div:not([align="center"]):has("> strong")').length);
		var agendaItems =$('div:not([align="center"]):has("> strong"), table:has(a.Agenda)')
		  .map( (i,el) => parseAgendaItem(i,el,$) )
		  .get()
		
		// const filename = "agenda-items.json"
		// fs.writeFile(filename, JSON.stringify(agendaItems, null, 4))
		// console.log(JSON.stringify(agendaItems));
		meeting.agenda = agendaItems;
		cb(null, meeting)
	})
}

function writeMeetingsToFiles(meetings){
	mkdirp('meetings', () => {
		const filename = "meetings/meetings.json"
		fs.writeFile(filename, JSON.stringify(meetings, null, 4))
		
		for(var x in Bodies){
			var bodyMeetings = _.filter(meetings, {meeting_body: Bodies[x].name});
			if(bodyMeetings.length == 0)
				continue;
			// var empty = _.map(bodyMeetings, function(x) {
				// return _.omit(x, _.isUndefined)
			// })
			// console.log(empty.length);
			// console.log(bodyMeetings[0].agenda);
			
			const filename = "meetings/"+Bodies[x].name.replace(/ /g,"_")+"_meetings.json"
			fs.writeFile(filename, JSON.stringify(bodyMeetings, null, 4))
		}
	})
}
getGranicusView();