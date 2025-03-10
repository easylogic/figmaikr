import { ParsedStyle, FigmaPaint, FigmaColor, FigmaGradient, FigmaSolidPaint, FigmaGradientLinear, FigmaGradientRadial, FigmaGradientAngular } from '../types';
import { isValidNumber } from '../utils/validators';
import { parseColor } from '../utils/colors';
import { GRADIENT_TRANSFORMS } from '../config/constants';
import { COLORS } from '../config/tokens';
import { round } from '../utils/math';

type BoundVariable = {
  type: 'VARIABLE_ALIAS';
  id: string;
};

type FigmaVariableColor = {
  boundVariables?: {
    color: BoundVariable;
  };
};

type FigmaVariableSolidPaint = FigmaSolidPaint & FigmaVariableColor;
type FigmaVariableGradientStop = {
  position: number;
  color: FigmaColor;
} & FigmaVariableColor;

type FigmaVariableGradientPaint = (
  | (Omit<FigmaGradientLinear, 'gradientStops'> & { gradientStops: FigmaVariableGradientStop[] })
  | (Omit<FigmaGradientRadial, 'gradientStops'> & { gradientStops: FigmaVariableGradientStop[] })
  | (Omit<FigmaGradientAngular, 'gradientStops'> & { gradientStops: FigmaVariableGradientStop[] })
);

type FigmaVariablePaint = FigmaVariableSolidPaint | FigmaVariableGradientPaint;

export function convertBackgroundToFigma(style: ParsedStyle): FigmaVariablePaint[] {
  const result: FigmaVariablePaint[] = [];

  switch (style.property) {
    case 'backgroundColor':
      if (style.variant === 'figma-variable' && style.variableId) {
        
        const paint: FigmaVariableSolidPaint = {
          type: 'SOLID',
          color: { r: 0, g: 0, b: 0 },
          opacity: style.opacity,
          boundVariables: {
            color: {
              type: 'VARIABLE_ALIAS',
              id: style.variableId
            }
          }
        };
        result.push(paint);
      } else if (typeof style.value === 'string') {
        
        let colorStr: string | FigmaColor | undefined;
        if (style.variant === 'preset') {
          colorStr = typeof COLORS[style.value] === 'string' ? COLORS[style.value] : undefined;
        } else {
          colorStr = style.value;
        }
        
        if (colorStr) {
          const color = parseColor(colorStr as string);
          if (color) {
            const fill: FigmaVariableSolidPaint = {
              type: 'SOLID',
              color: { 
                r: color.r,
                g: color.g,
                b: color.b
              },
              ...(isValidNumber(color.a) ? { opacity: color.a } : 
                 style.opacity !== undefined ? { opacity: style.opacity } : {})
            };
            result.push(fill);
          }
        }
      } else if (typeof style.value === 'object') {
        const fill: FigmaVariableSolidPaint = {
          type: 'SOLID',
          color: {
            r: (style.value as FigmaColor).r,
            g: (style.value as FigmaColor).g,
            b: (style.value as FigmaColor).b,
          },
          ...(style.opacity !== undefined && { opacity: style.opacity })
        };
        result.push(fill);
      }
      break;
  }

  return result;
}

export function convertGradientListToFigma(styles: ParsedStyle[]): FigmaVariablePaint[] {
  const group: ParsedStyle[][] = [];
  let groupIndex = -1;

  for (const style of styles) {
    if (style.property === 'backgroundColor') {
      groupIndex++;
      group.push([]);
    }

    group[groupIndex].push(style);
  }

  return group.map(convertGradientToFigma).flat();
}

export function convertGradientToFigma(styles: ParsedStyle[]): FigmaVariablePaint[] {
  const result: FigmaVariablePaint[] = [];
  
  const gradientRoot = styles.find(s => s.property === 'backgroundColor');
  const gradientType = gradientRoot?.value;
  const gradientDirection = gradientRoot?.direction;

  
  let gradientPaint: FigmaVariableGradientPaint = {
    type: 'GRADIENT_LINEAR',
    gradientStops: [],
    gradientTransform: [[1, 0, 0], [0, 1, 0]]
  };

  if (gradientType === 'linear') {
    if (gradientDirection) {
      const transform = GRADIENT_TRANSFORMS[gradientDirection as keyof typeof GRADIENT_TRANSFORMS];
      if (transform) {
        gradientPaint.gradientTransform = transform as [[number, number, number], [number, number, number]];
      }
    }
  } else if (gradientType === 'radial') {
    gradientPaint = {
      type: 'GRADIENT_RADIAL',
      gradientStops: [],
      centerX: 0.5,
      centerY: 0.5,
      radius: 0.5
    };
  } else if (gradientType === 'conic') {
    gradientPaint = {
      type: 'GRADIENT_ANGULAR',
      gradientStops: [],
      centerX: 0.5,
      centerY: 0.5,
      rotation: 0
    };
  }

  
  const colorStops = styles.filter(s => 
    s.property === 'gradientFrom' || 
    s.property === 'gradientVia' || 
    s.property === 'gradientTo'
  );

  let unitPosition = 0.5;
  if (colorStops.length > 2) {
    unitPosition = 1 / (colorStops.length - 1);
  }

  let startPosition = 0;
  
  for (const stop of colorStops) {
    let position = 0;

    if (stop.property === 'gradientFrom') {
      position = 0;
    } else if (stop.property === 'gradientTo') {
      position = 1;
    } else {
      position = startPosition + unitPosition;
      startPosition = position;
    }

    if (stop.variant === 'figma-variable' && stop.variableId) {
      
      const gradientStop: FigmaVariableGradientStop = {
        position,
        color: {
          r: 0,
          g: 0,
          b: 0,
          ...(stop.opacity !== undefined && { a: stop.opacity })
        },
        boundVariables: {
          color: {
            type: 'VARIABLE_ALIAS',
            id: stop.variableId
          }
        }
      };
      gradientPaint.gradientStops.push(gradientStop);
    } else if (typeof stop.value === 'string') {
      const color = parseColor(stop.value);
      if (color) {
        const gradientStop: FigmaVariableGradientStop = {
          position,
          color: {
            r: round(color.r, 3),
            g: round(color.g, 3),
            b: round(color.b, 3),
            ...(color.a !== undefined ? { a: round(color.a, 3) } : 
               stop.opacity !== undefined ? { a: stop.opacity } : {})
          }
        };
        gradientPaint.gradientStops.push(gradientStop);
      }
    } else if (typeof stop.value === 'object') {
      const gradientStop: FigmaVariableGradientStop = {
        position,
        color: {
          ...stop.value as FigmaColor,
          ...(stop.opacity !== undefined && { a: stop.opacity })
        }
      };
      gradientPaint.gradientStops.push(gradientStop);
    }
  }

  
  if (gradientPaint.gradientStops.length > 0) {
    result.push(gradientPaint);
  }

  return result;
}

