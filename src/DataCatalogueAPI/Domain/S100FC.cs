using System.Text.Json.Serialization;

namespace S100FC.S840.FeatureTypes
{
    /// <summary>The S-840 feature carrying a package's geographical area of interest.</summary>
    public sealed class PackageCoverage : S100FC.FeatureType, IInformationBindings, IFeatureBindings
    {
        public const int _sourceIdentifier = 10001;

        private static readonly attributeBindingDefinition[] Bindings = [
            S840AttributeDefinitions.RequiredText("packageId"),
            S840AttributeDefinitions.RequiredText("absoluteUri"),
        ];

        [JsonIgnore]
        public override string S100FC_code => nameof(PackageCoverage);
        [JsonIgnore]
        public override string S100FC_name => "Package Coverage";
        [JsonIgnore]
        public override int sourceIdentifier => _sourceIdentifier;
        [JsonIgnore]
        public override attributeBindingDefinition[] attributeBindingsCatalogue => Bindings;
        [JsonIgnore]
        public override Primitives[] permittedPrimitives => [Primitives.surface];

        public override informationBindingDefinition[] GetInformationBindingsDefinitions() => [];
        public override featureBindingDefinition[] GetFeatureBindingsDefinitions() => [];

        [JsonIgnore]
        public string packageId {
            get => GetAttributeValue<TextAttribute>(nameof(packageId))?.value ?? string.Empty;
            set => SetAttribute(new TextAttribute { S100FC_code = nameof(packageId), value = value });
        }

        [JsonIgnore]
        public string absoluteUri {
            get => GetAttributeValue<TextAttribute>(nameof(absoluteUri))?.value ?? string.Empty;
            set => SetAttribute(new TextAttribute { S100FC_code = nameof(absoluteUri), value = value });
        }

        public static informationBindingDefinition[] informationBindingsDefinitions => [];
        public static featureBindingDefinition[] featureBindingsDefinitions => [];
    }

    /// <summary>The S-840 feature for source geometry belonging to a package.</summary>
    public sealed class PackageDetailedGeometry : S100FC.FeatureType, IInformationBindings, IFeatureBindings
    {
        public const int _sourceIdentifier = 10002;

        private static readonly attributeBindingDefinition[] Bindings = [
            S840AttributeDefinitions.RequiredText("packageId"),
            S840AttributeDefinitions.RequiredText("absoluteUri"),
        ];

        [JsonIgnore]
        public override string S100FC_code => nameof(PackageDetailedGeometry);
        [JsonIgnore]
        public override string S100FC_name => "Package Detailed Geometry";
        [JsonIgnore]
        public override int sourceIdentifier => _sourceIdentifier;
        [JsonIgnore]
        public override attributeBindingDefinition[] attributeBindingsCatalogue => Bindings;
        [JsonIgnore]
        public override Primitives[] permittedPrimitives => [Primitives.point, Primitives.pointSet, Primitives.curve, Primitives.surface];

        public override informationBindingDefinition[] GetInformationBindingsDefinitions() => [];
        public override featureBindingDefinition[] GetFeatureBindingsDefinitions() => [];

        [JsonIgnore]
        public string packageId {
            get => GetAttributeValue<TextAttribute>(nameof(packageId))?.value ?? string.Empty;
            set => SetAttribute(new TextAttribute { S100FC_code = nameof(packageId), value = value });
        }

        [JsonIgnore]
        public string absoluteUri {
            get => GetAttributeValue<TextAttribute>(nameof(absoluteUri))?.value ?? string.Empty;
            set => SetAttribute(new TextAttribute { S100FC_code = nameof(absoluteUri), value = value });
        }

        public static informationBindingDefinition[] informationBindingsDefinitions => [];
        public static featureBindingDefinition[] featureBindingsDefinitions => [];
    }

    /// <summary>The S-840 feature defining a severity area.</summary>
    public sealed class SeverityCoverage : S100FC.FeatureType, IInformationBindings, IFeatureBindings
    {
        public const int _sourceIdentifier = 10003;

        private static readonly attributeBindingDefinition[] Bindings = [
            S840AttributeDefinitions.RequiredNumeric("severity"),
        ];

        [JsonIgnore]
        public override string S100FC_code => nameof(SeverityCoverage);
        [JsonIgnore]
        public override string S100FC_name => "Severity Coverage";
        [JsonIgnore]
        public override int sourceIdentifier => _sourceIdentifier;
        [JsonIgnore]
        public override attributeBindingDefinition[] attributeBindingsCatalogue => Bindings;
        [JsonIgnore]
        public override Primitives[] permittedPrimitives => [Primitives.surface];

        public override informationBindingDefinition[] GetInformationBindingsDefinitions() => [];
        public override featureBindingDefinition[] GetFeatureBindingsDefinitions() => [];

        [JsonIgnore]
        public ulong severity {
            get => checked((ulong)(GetAttributeValue<RealAttribute>(nameof(severity))?.value ?? 0m));
            // The framework's IntegerAttribute is Int32. Decimal retains all UInt64 values
            // without changing the existing numeric JSON representation.
            set => SetAttribute(new RealAttribute { S100FC_code = nameof(severity), value = value });
        }

        public static informationBindingDefinition[] informationBindingsDefinitions => [];
        public static featureBindingDefinition[] featureBindingsDefinitions => [];
    }

    /// <summary>The S-840 feature describing an operational pipeline's workspace.</summary>
    public sealed class WorkspaceCoverage : S100FC.FeatureType, IInformationBindings, IFeatureBindings
    {
        // Preserve the identifier of the existing workspace feature definition.
        public const int _sourceIdentifier = 10000;

        private static readonly attributeBindingDefinition[] Bindings = [
            S840AttributeDefinitions.RequiredText("pipelineId"),
            S840AttributeDefinitions.RequiredText("displayName"),
        ];

        [JsonIgnore]
        public override string S100FC_code => nameof(WorkspaceCoverage);
        [JsonIgnore]
        public override string S100FC_name => "Workspace Coverage";
        [JsonIgnore]
        public override int sourceIdentifier => _sourceIdentifier;
        [JsonIgnore]
        public override attributeBindingDefinition[] attributeBindingsCatalogue => Bindings;
        [JsonIgnore]
        public override Primitives[] permittedPrimitives => [Primitives.point, Primitives.pointSet, Primitives.curve, Primitives.surface];

        public override informationBindingDefinition[] GetInformationBindingsDefinitions() => [];
        public override featureBindingDefinition[] GetFeatureBindingsDefinitions() => [];

        [JsonIgnore]
        public string pipelineId {
            get => GetAttributeValue<TextAttribute>(nameof(pipelineId))?.value ?? string.Empty;
            set => SetAttribute(new TextAttribute { S100FC_code = nameof(pipelineId), value = value });
        }

        [JsonIgnore]
        public string displayName {
            get => GetAttributeValue<TextAttribute>(nameof(displayName))?.value ?? string.Empty;
            set => SetAttribute(new TextAttribute { S100FC_code = nameof(displayName), value = value });
        }

        public static informationBindingDefinition[] informationBindingsDefinitions => [];
        public static featureBindingDefinition[] featureBindingsDefinitions => [];
    }

    internal static class S840AttributeDefinitions
    {
        public static attributeBindingDefinition RequiredText(string code) => new() {
            attribute = code,
            lower = 1,
            upper = 1,
            CreateInstance = () => new TextAttribute { S100FC_code = code },
        };

        public static attributeBindingDefinition RequiredNumeric(string code) => new() {
            attribute = code,
            lower = 1,
            upper = 1,
            CreateInstance = () => new RealAttribute { S100FC_code = code },
        };
    }
}
