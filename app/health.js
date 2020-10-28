const express  = require( 'express' )
const pjson    = require( './package.json' )
const log      = require( './log' ).logger

module.exports = {
  initHealthEndpoint
}

const healthPort = process.env.HEALTH_PORT
const healthPath = process.env.HEALTH_PATH

// ----------------------------------------------------------------------------
let expressApp  = express()

let metrics = null
let upSince = ( new Date() ).toISOString()


function initHealthEndpoint( healtMetrics ) {
  metrics = healtMetrics
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