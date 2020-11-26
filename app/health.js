const express  = require( 'express' )
const pjson    = require( './package.json' )
const log      = require( './log' ).logger

module.exports = {
  initHealthEndpoint
}

const healthPort = 8080
let   healthPath = null
let   token      = null

// ----------------------------------------------------------------------------
let expressApp  = express()

let metrics = null
let upSince = ( new Date() ).toISOString()


function initHealthEndpoint( path, healtMetrics, authToken ) {
  metrics = healtMetrics
  healthPath = path
  token      = authToken

  if ( healthPort && healthPath ) {

    expressApp.get( healthPath, (req, res) => {
      log.debug( 'GET '+healthPath, req.query )
      let resJSON = {
        name      : pjson.name,
        version   : pjson.version,
        upSince   : upSince,
        metrics   : metrics
      }
      if ( token ) {
        if ( req.query && req.query.token != token ) {
          resJSON = {}
        }
      }
      res.send( resJSON )
    })

    expressApp.get( healthPath+'/tracelogs', (req, res) => {
      log.info( 'GET '+healthPath+'/tracelogs' )
      if ( req.query && req.query.token && token ) {
        if ( req.query.token == token ) {
          metrics.tracelogs = ! metrics.tracelogs
          log.info( 'tracelogs=' +metrics.tracelogs )
        }
      } else if ( req.query.token == 'test' ) {
          metrics.tracelogs = ! metrics.tracelogs
          log.info( 'Use default token!!' )
          log.info( 'tracelogs=' +metrics.tracelogs )
      }
      res.send( { tracelogs: metrics.tracelogs } )
    })

    expressApp.listen( healthPort )
    log.info( `Health app listening on port ${healthPort} and path "${healthPath}"` )

  } else {
    log.info( 'Health check endpoint not configured' )
  }
}