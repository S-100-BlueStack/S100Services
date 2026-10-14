using Microsoft.VisualBasic;
using System.Text.Json.Serialization;

namespace S100FC.S101.FeatureTypes
{
    public class WorkspaceCoverage : S100FC.FeatureType, IInformationBindings, IFeatureBindings
    {
        [JsonIgnore]
        public override string S100FC_code => nameof(WorkspaceCoverage);
        [JsonIgnore]
        public override string S100FC_name => "Workspace Coverage";
        [JsonIgnore]
        public override int sourceIdentifier => WorkspaceCoverage._sourceIdentifier;
        public const int _sourceIdentifier = 10000;

        #region Catalogue
        [JsonIgnore]
        public override attributeBindingDefinition[] attributeBindingsCatalogue => [               
            ];

        public override informationBindingDefinition[] GetInformationBindingsDefinitions() => WorkspaceCoverage.informationBindingsDefinitions;

        public static informationBindingDefinition[] informationBindingsDefinitions => [
            ];

        public override featureBindingDefinition[] GetFeatureBindingsDefinitions() => WorkspaceCoverage.featureBindingsDefinitions;

        public static featureBindingDefinition[] featureBindingsDefinitions => [
            ];
        #endregion

        [JsonIgnore]
        public override Primitives[] permittedPrimitives => [Primitives.surface];
    }
}
