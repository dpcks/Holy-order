import { Minus, Plus } from 'lucide-react';

interface QuantitySelectorProps {
  quantity: number;
  onIncrease: () => void;
  onDecrease: () => void;
  min?: number;
  max?: number;
}

export const QuantitySelector = ({
  quantity,
  onIncrease,
  onDecrease,
  min = 1,
  max = 99
}: QuantitySelectorProps) => {
  return (
    <div className="flex items-center bg-gray-100 rounded-full h-9 px-1 w-28">
      <button
        onClick={onDecrease}
        disabled={quantity <= min}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-sm text-gray-600 disabled:opacity-50 disabled:shadow-none transition-colors"
      >
        <Minus size={16} />
      </button>
      <span className="flex-1 text-center font-semibold text-gray-800 text-sm">
        {quantity}
      </span>
      <button
        onClick={onIncrease}
        disabled={quantity >= max}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-sm text-gray-600 disabled:opacity-50 disabled:shadow-none transition-colors"
      >
        <Plus size={16} />
      </button>
    </div>
  );
};
