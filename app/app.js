const nsg    = require( 'azure-nsg-ban-ips' )
const log    = require( './log' ).logger
const pjson  = require( './package.json' )
const ehLogs = require( './eh-logs' )
const stats  = require( './health' )

log.info( 'Starting '+pjson.name+' v'+pjson.version )

// change this:
const aadId   = process.env.AAD_ID 
const spId    = process.env.SP_ID  
const spKey   = process.env.SP_KEY 
const subId   = process.env.SUB_ID 
const rgName  = process.env.RG 
const nsgName = process.env.NSG

let status = {
  msgCnt    : 0,
  errCnt    : 0,
  bannedIPs : {}
}

run()

// run clean up of NSGs every hour
setInterval( unbanIPs, 60 * 60 * 1000 ) 

async function run() {
  try {
    log.info( 'Login for NSG operations...' )
    // get credentials for all following operations first:
    await nsg.login( spId, spKey, aadId,  subId, rgName, nsgName  )

    log.info( 'Start EventHub listener...' )
    ehLogs.startEhStreamReceiver( status, async ( maliciousIPaddr ) => {
      try {
        await nsg.addIpAddrArrToBlacklist( [ maliciousIPaddr ] )
        bannedIPs[ ip ] = ( new Date() ).toISOString()
      } catch ( exc ) { log.error( exc ) }
    })

    stats.initHealthEndpoint( status )

  } catch ( exc ) {
    log.error( 'Exception in MAIN run()', exc )
  }
}


// remove all ban rules older than 2 days
function unbanIPs() {
  nsg.cleanupOldBlacklists()
}