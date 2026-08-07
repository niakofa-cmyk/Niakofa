/// SankofaRig — bone transform tree.
///
/// Dart port of artifacts/pay-it-forward/src/components/SankofaBird/Core/SankofaRig.ts

enum BirdPart {
  head,
  neckUpper,
  neckLower,
  chest,
  tail,
  leftWingUpper,
  leftWingLower,
  rightWingUpper,
  rightWingLower,
}

class BirdNode {
  double localDeg = 0;
  double worldDeg = 0;
  BirdPart? parent;

  BirdNode({this.parent});
}

class SankofaRig {
  final Map<BirdPart, BirdNode> _nodes = {
    BirdPart.head:           BirdNode(parent: BirdPart.neckUpper),
    BirdPart.neckUpper:      BirdNode(parent: BirdPart.neckLower),
    BirdPart.neckLower:      BirdNode(parent: BirdPart.chest),
    BirdPart.chest:          BirdNode(),
    BirdPart.tail:           BirdNode(parent: BirdPart.chest),
    BirdPart.leftWingUpper:  BirdNode(parent: BirdPart.chest),
    BirdPart.leftWingLower:  BirdNode(parent: BirdPart.leftWingUpper),
    BirdPart.rightWingUpper: BirdNode(parent: BirdPart.chest),
    BirdPart.rightWingLower: BirdNode(parent: BirdPart.rightWingUpper),
  };

  void setRotation(BirdPart part, double deg) {
    _nodes[part]!.localDeg = deg;
  }

  BirdNode get(BirdPart part) => _nodes[part]!;

  void resolveAll() {
    // Resolve in topological order (root → leaves).
    final order = [
      BirdPart.chest,
      BirdPart.tail,
      BirdPart.neckLower,
      BirdPart.neckUpper,
      BirdPart.head,
      BirdPart.leftWingUpper,
      BirdPart.leftWingLower,
      BirdPart.rightWingUpper,
      BirdPart.rightWingLower,
    ];
    for (final part in order) {
      final node = _nodes[part]!;
      final parentPart = node.parent;
      final parentWorldDeg =
          parentPart != null ? _nodes[parentPart]!.worldDeg : 0.0;
      node.worldDeg = parentWorldDeg + node.localDeg;
    }
  }

  void reset() {
    for (final node in _nodes.values) {
      node.localDeg = 0;
      node.worldDeg = 0;
    }
  }
}
