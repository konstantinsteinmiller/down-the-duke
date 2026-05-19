// Minimal GDJS runtime typings. Subset of the real surface — expand as needed.
// These are ambient (no `export`) so every module in game-src/ sees them.

declare global {
  interface GdjsRuntimeScene {
    getElapsedTime(): number;

    getTimeScale(): number;

    getGame(): GdjsRuntimeGame;

    getObjects(name: string): GdjsRuntimeObject[];

    createObject(name: string, x?: number, y?: number): GdjsRuntimeObject | null;

    getVariables(): GdjsVariablesContainer;

    getLayer(name: string): GdjsLayer;
  }

  interface GdjsRuntimeGame {
    getInputManager(): GdjsInputManager;

    getGameResolutionWidth(): number;

    getGameResolutionHeight(): number;
  }

  interface GdjsInputManager {
    isKeyPressed(keyCode: number): boolean;

    wasKeyReleased(keyCode: number): boolean;

    getCursorX(): number;

    getCursorY(): number;

    isMouseButtonPressed(button: number): boolean;
  }

  interface GdjsRuntimeObject {
    setX(x: number): void;

    setY(y: number): void;

    getX(): number;

    getY(): number;

    getWidth(): number;

    getHeight(): number;

    getCenterX(): number;

    getCenterY(): number;

    setAngle(angle: number): void;

    getAngle(): number;

    setZOrder(z: number): void;

    getZOrder(): number;

    setScale(scale: number): void;

    setScaleX(scale: number): void;

    setScaleY(scale: number): void;

    deleteFromScene(scene: GdjsRuntimeScene): void;

    getVariables(): GdjsVariablesContainer;
  }

  interface GdjsVariablesContainer {
    get(name: string): GdjsVariable;

    has(name: string): boolean;
  }

  interface GdjsVariable {
    setNumber(n: number): void;

    getAsNumber(): number;

    setString(s: string): void;

    getAsString(): string;
  }

  interface GdjsLayer {
    setCameraX(x: number): void;

    setCameraY(y: number): void;

    getCameraX(): number;

    getCameraY(): number;
  }

  interface GdjsStatic {
    RuntimeObject: {
      collisionTest(a: GdjsRuntimeObject, b: GdjsRuntimeObject, ignoreTouchingEdges?: boolean): boolean;
    };
  }

  const gdjs: GdjsStatic;
}

export {};
