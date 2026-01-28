import React, { useState } from 'react';

export interface PaymentMethodsManagerProps {
  paymentMethods: string[];
  setPaymentMethods: (methods: string[]) => void;
}

const PaymentMethodsManager: React.FC<PaymentMethodsManagerProps> = ({ paymentMethods, setPaymentMethods }) => {
  const [newMethod, setNewMethod] = useState('');

  const addMethod = () => {
    const trimmed = newMethod.trim();
    if (trimmed && !paymentMethods.includes(trimmed)) {
      setPaymentMethods([...paymentMethods, trimmed]);
      setNewMethod('');
    }
  };

  const deleteMethod = (method: string) => {
    setPaymentMethods(paymentMethods.filter(m => m !== method));
  };

    return (
      <div className="space-y-3">
        <label className="block font-semibold mb-2 text-gray-700 dark:text-gray-200 text-sm">Payment Methods</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={newMethod}
            onChange={e => setNewMethod(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 rounded-lg px-3 py-2 flex-1 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition"
            placeholder="Add new method"
          />
          <button type="button" onClick={addMethod} className="bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition">Add</button>
        </div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {paymentMethods.map(method => (
            <div key={method} className="flex items-center justify-between bg-gray-100 dark:bg-gray-800 rounded-full px-4 py-2 shadow-sm border border-gray-200 dark:border-gray-700">
              <span className="text-sm text-gray-800 dark:text-gray-100 font-medium truncate">{method}</span>
              <button
                type="button"
                onClick={() => deleteMethod(method)}
                className="ml-2 text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-900/30 transition"
                title="Delete"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    );
};

export default PaymentMethodsManager;
