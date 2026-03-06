@description('Environment name (dev or prod)')
@allowed(['dev', 'prod'])
param environment string = 'dev'

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('API key for function authentication')
@secure()
param apiKey string

module storage 'modules/storage.bicep' = {
  name: 'storage-deployment'
  params: {
    environment: environment
    location: location
  }
}

module appInsights 'modules/appInsights.bicep' = {
  name: 'appinsights-deployment'
  params: {
    environment: environment
    location: location
  }
}

module serviceBus 'modules/serviceBus.bicep' = {
  name: 'servicebus-deployment'
  params: {
    environment: environment
    location: location
  }
}

module cosmosDb 'modules/cosmosDb.bicep' = {
  name: 'cosmosdb-deployment'
  params: {
    environment: environment
    location: location
  }
}

module functionApp 'modules/functionApp.bicep' = {
  name: 'functionapp-deployment'
  params: {
    environment: environment
    location: location
    storageConnectionString: storage.outputs.storageConnectionString
    serviceBusConnectionString: serviceBus.outputs.serviceBusConnectionString
    cosmosEndpoint: cosmosDb.outputs.cosmosEndpoint
    cosmosKey: cosmosDb.outputs.cosmosKey
    cosmosDatabaseName: cosmosDb.outputs.cosmosDatabaseName
    cosmosContainerName: cosmosDb.outputs.cosmosContainerName
    appInsightsConnectionString: appInsights.outputs.appInsightsConnectionString
    apiKey: apiKey
  }
}

output functionAppUrl string = functionApp.outputs.functionAppUrl
output functionAppName string = functionApp.outputs.functionAppName
