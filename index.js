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
const cheerio = require('cheerio')
const _ = require('lodash')
const async = require('async')
const fs = require('fs')
const mkdirp = require('mkdirp')

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
