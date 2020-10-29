const nsg    = require( 'azure-nsg-ban-ips' )
const log    = require( './log' ).logger
const pjson  = require( './package.json' )
const ehLogs = require( './eh-logs' )
const stats  = require( './health' )

log.info( 'Starting '+pjson.name+' v'+pjson.version )

let cfg = readConfig()

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
    await nsg.login( cfg.spId, cfg.spKey, cfg.aadId, cfg.subId, cfg.rgName, cfg.nsgName )

    log.info( 'Start EventHub listener...' )
    ehLogs.startEhStreamReceiver( status, async ( maliciousIPaddr ) => {
      try {
        await nsg.addIpAddrArrToBlacklist( [ maliciousIPaddr ] )
        bannedIPs[ ip ] = ( new Date() ).toISOString()
        log.info( 'Banned IP address: '+maliciousIPaddr )
      } catch ( exc ) { log.error( exc ) }
    })

    stats.initHealthEndpoint( status )

  } catch ( exc ) { log.error( 'Exception in MAIN run()', exc ) }
}


// remove all ban rules older than 2 days
function unbanIPs() {
  nsg.cleanupOldBlacklists()
}

// ----------------------------------------------------------------------------
// helper

function readConfig() {
  let configs = { 
    aadId   : 'AAD_ID', 
    spId    : 'SP_ID',
    spKey   : 'SP_KEY',
    subId   : 'SUB_ID',
    rgName  : 'RG',
    nsgName : 'NSG'
  }
  for ( let aCfg in configs ) {
    let cfgVar = configs[ aCfg ]
    if ( process.env[ cfgVar ] ) {
      configs[ aCfg ] = process.env[ cfgVar ] 
    } else {
      console.log( 'ERROR: Environment variable '+cfgVar+' not set.' )
      process.exit( 0 )
    }
  }
  return configs
}
