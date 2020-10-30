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

// ----------------------------------------------------------------------------

async function run() {
  try {
    log.info( 'Login for NSG operations...' )
    // get credentials for all following operations first:
    await nsg.login( cfg.spId, cfg.spKey, cfg.aadId, cfg.nsgSubId, cfg.nsgRG, cfg.nsgName )

    log.info( 'Start EventHub listener...' )
    ehLogs.init( status, cfg )
    ehLogs.startEhStreamReceiver( async ( maliciousIPaddr ) => {
      try {
        log.info( 'Ban IP address '+maliciousIPaddr+' ...' )
        await nsg.addIpAddrArrToBlacklist( [ maliciousIPaddr ] )
        status.bannedIPs[ maliciousIPaddr ] = ( new Date() ).toISOString()
      } catch ( exc ) { log.error( exc ) }
    })

    stats.initHealthEndpoint( cfg.healthzPath, status )

  } catch ( exc ) { 
    log.error( 'Exception in MAIN run()', exc ) 
    process.exit( 0 )
  }
}


// remove all ban rules older than 2 days
function unbanIPs() {
  nsg.cleanupOldBlacklists()
}

// ----------------------------------------------------------------------------
// helper

function readConfig() {
  let mustDie = false
  let configs = { 
    aadId        : 'AAD_ID', 
    spId         : 'SP_ID',
    spKey        : 'SP_KEY',
    nsgName      : 'NSG',
    nsgRG        : 'NSG_RG',
    nsgSubId     : 'NSG_SUB_ID',
    ehNameSpace  : 'EH_NS',
    ehName       : 'EH_NAME',
    ehKeyName    : 'EH_KEY_NAME',
    ehKey        : 'EH_KEY',
    errorsMax    : 'ERROR_THRESHOLD',
    nogoPatterns : 'NOGO_REQUESTS',
    nogoMax      : 'NOGO_THRESHOLD',
    healthzPath  : 'HEALTH_PATH'
  }
  for ( let aCfg in configs ) {
    let cfgVar = configs[ aCfg ]
    if ( process.env[ cfgVar ] ) {
      configs[ aCfg ] = process.env[ cfgVar ] 
    } else {
      console.log( 'ERROR: Environment variable '+cfgVar+' not set.' )
      mustDie = true
    }
  }
  if ( mustDie ) { 
    process.exit( 0 ) 
  }
  return configs
}