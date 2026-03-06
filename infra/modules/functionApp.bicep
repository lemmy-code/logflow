@description('Environment name')
param environment string

@description('Azure region')
param location string = resourceGroup().location

@description('Project name')
param projectName string = 'logflow'

@description('Storage connection string')
param storageConnectionString string

@description('Service Bus connection string')
@secure()
param serviceBusConnectionString string

@description('CosmosDB endpoint')
param cosmosEndpoint string

@description('CosmosDB key')
@secure()
param cosmosKey string

@description('CosmosDB database name')
param cosmosDatabaseName string

@description('CosmosDB container name')
param cosmosContainerName string

@description('Application Insights connection string')
param appInsightsConnectionString string

@description('API key for authentication')
@secure()
param apiKey string

var appServicePlanName = '${projectName}-${environment}-plan'
var functionAppName = '${projectName}-${environment}-func'

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: appServicePlanName
  location: location
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: {
    reserved: true
  }
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'Node|20'
      appSettings: [
        { name: 'AzureWebJobsStorage', value: storageConnectionString }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' }
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
        { name: 'SERVICE_BUS_CONNECTION_STRING', value: serviceBusConnectionString }
        { name: 'COSMOS_ENDPOINT', value: cosmosEndpoint }
        { name: 'COSMOS_KEY', value: cosmosKey }
        { name: 'COSMOS_DATABASE', value: cosmosDatabaseName }
        { name: 'COSMOS_CONTAINER', value: cosmosContainerName }
        { name: 'API_KEY', value: apiKey }
        { name: 'NODE_ENV', value: environment == 'prod' ? 'production' : 'development' }
        { name: 'AZURE_REGION', value: location }
        { name: 'WEBSITE_NODE_DEFAULT_VERSION', value: '~20' }
      ]
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
    }
  }
}

output functionAppName string = functionApp.name
output functionAppUrl string = 'https://${functionApp.properties.defaultHostName}'
