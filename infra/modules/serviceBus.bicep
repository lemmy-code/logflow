@description('Environment name')
param environment string

@description('Azure region')
param location string = resourceGroup().location

@description('Project name')
param projectName string = 'logflow'

var namespaceName = '${projectName}-${environment}-sbus'
var queueName = 'logflow-ingest'

resource serviceBusNamespace 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' = {
  name: namespaceName
  location: location
  sku: {
    name: environment == 'prod' ? 'Standard' : 'Basic'
    tier: environment == 'prod' ? 'Standard' : 'Basic'
  }
}

resource queue 'Microsoft.ServiceBus/namespaces/queues@2022-10-01-preview' = {
  parent: serviceBusNamespace
  name: queueName
  properties: {
    maxDeliveryCount: 3
    lockDuration: 'PT1M'
    defaultMessageTimeToLive: 'P7D'
    deadLetteringOnMessageExpiration: true
    maxSizeInMegabytes: 1024
  }
}

var listKeysEndpoint = '${serviceBusNamespace.id}/AuthorizationRules/RootManageSharedAccessKey'

output serviceBusConnectionString string = listKeys(listKeysEndpoint, serviceBusNamespace.apiVersion).primaryConnectionString
