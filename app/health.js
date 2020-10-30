const express  = require( 'express' )
const pjson    = require( './package.json' )
const log      = require( './log' ).logger

module.exports = {
  initHealthEndpoint
}

const healthPort = 8080
let   healthPath = null

// ----------------------------------------------------------------------------
let expressApp  = express()

let metrics = null
let upSince = ( new Date() ).toISOString()


function initHealthEndpoint( path, healtMetrics ) {
  metrics = healtMetrics
  healthPath = path
  if ( healthPort && healthPath ) {

    expressApp.get( healthPath, (req, res) => {
      // console.log('GET /signalr-mon/health')
      res.send({
        name      : pjson.name,
        version   : pjson.version,
        upSince   : upSince,
        metrics   : metrics
      })
    })
  
    expressApp.listen( healthPort )
    log.info( `Health app listening on port ${healthPort} and path "${healthPath}"` )

  } else {
    log.info( 'Health check endpoint not configured' )
  }
}