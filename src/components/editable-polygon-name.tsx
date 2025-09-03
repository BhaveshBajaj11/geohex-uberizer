
'use client';

import {useState, useRef, useEffect} from 'react';
import {Pencil, Check, X} from 'lucide-react';
import {Input} from './ui/input';
import {Button} from './ui/button';

type EditablePolygonNameProps = {
  initialName: string;
  onSave: (newName: string) => void;
};

export default function EditablePolygonName({initialName, onSave}: EditablePolygonNameProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    if (name.trim()) {
      onSave(name.trim());
    } else {
      setName(initialName); // Reset if name is empty
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setName(initialName);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div
        className="flex items-center gap-2"
        onClick={(e) => e.stopPropagation()} // Prevent accordion from toggling
      >
        <Input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-8"
        />
        <Button size="icon" className="h-8 w-8" onClick={handleSave}>
          <Check className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div
      className="group flex items-center gap-2 cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
    >
      <h4 className="font-semibold group-hover:underline">{name}</h4>
      <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}
