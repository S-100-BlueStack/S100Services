# Product Catalogue local startup

## Step 1

In Visual Studio, select:

- `ProductCatalogueAPI`
- `Debug | x64`

## Step 2

Build `ProductCatalogueAPI`.

## Step 3

Start the API with `F5`.

## Step 4

From the repository root (C:\Users\Bnnnnn\source\repos\S-100-Bluestack\S100Services), start the local worker:

```powershell
.\src\ProductCatalogueAPI\scripts\Manage-LocalProductCatalogueWorker.ps1
```

## Step 5

In Visual Studio, select:

`Debug > Attach to Process...`

## Step 6

Select the `ProductCatalogueAPI.exe` process running as the Worker and click `Attach`.

## Step 7

Start the Product Catalogue frontend as usual.

## Step 8

When finished, stop the local worker:

```powershell
.\src\ProductCatalogueAPI\scripts\Manage-LocalProductCatalogueWorker.ps1 -Action Stop
```
