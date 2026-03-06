@description('Environment name')
param environment string

@description('Azure region')
param location string = resourceGroup().location

@description('Project name')
param projectName string = 'logflow'

var accountName = '${projectName}-${environment}-cosmos'
var databaseName = 'logflow'
var containerName = 'logs'

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-02-15-preview' = {
  name: accountName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: environment == 'prod'
      }
    ]
    capabilities: environment == 'prod' ? [] : [
      { name: 'EnableServerless' }
    ]
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-02-15-preview' = {
  parent: cosmosAccount
  name: databaseName
  properties: {
    resource: {
      id: databaseName
    }
  }
}

resource container 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/sqlContainers@2024-02-15-preview' = {
  parent: database
  name: containerName
  properties: {
    resource: {
      id: containerName
      partitionKey: {
        paths: ['/appId']
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        includedPaths: [
          { path: '/appId/?' }
          { path: '/level/?' }
          { path: '/receivedAt/?' }
        ]
        excludedPaths: [
          { path: '/metadata/*' }
          { path: '/message/?' }
          { path: '/_etag/?' }
        ]
        compositeIndexes: [
          [
            { path: '/appId', order: 'ascending' }
            { path: '/receivedAt', order: 'descending' }
          ]
        ]
      }
      defaultTtl: 2592000
    }
  }
}

output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
output cosmosKey string = cosmosAccount.listKeys().primaryMasterKey
output cosmosDatabaseName string = databaseName
output cosmosContainerName string = containerName
